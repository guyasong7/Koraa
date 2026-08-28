"""Turning a storefront payment into a settled order — exactly once.

``settle_order`` is the only function allowed to mark a storefront order paid,
pay the merchant, or send an invoice. Three callers reach it — the buyer's
browser polling for a result, Fapshi's webhook, and ``reconcile_orders`` — and
none of them coordinate with the others, so the guarantee has to live here.

What went wrong in the version this replaces
--------------------------------------------

The settle logic sat inline in ``StorefrontOrderCallbackView`` and had four
defects that all cost money in different directions:

1. **The idempotency check was an unlocked read.** ``if order.payment_status ==
   PAID`` outside any transaction. Fapshi delivering a webhook while the buyer's
   browser polls is the *expected* case, not a rare race, and two callers that
   both read "pending" both paid the merchant. Now the marker is ``settled_at``,
   read under ``select_for_update`` inside the transaction that writes it, so the
   second caller blocks and then sees the work as done.

2. **Side effects ran outside the transaction**, after a bare ``order.save()``.
   A rollback anywhere after that point still emailed an invoice for an order
   that no longer existed as paid. They now run in ``on_commit``.

3. **The payout outcome was only logged.** A merchant who was never paid left no
   queryable trace, so there was nothing to retry and nothing to report. The
   ``payout_*`` fields on ``Order`` record it.

4. **An outage was read as a failed payment** — the old status helper returned
   ``"FAILED"`` on any non-200, so a Fapshi wobble marked good orders failed.
   Here ``FapshiUnavailable`` propagates to a ``"unknown"`` result that changes
   nothing, and the order stays pending for a later pass to finish.

The shape, and why it is that shape
-----------------------------------

    status = fapshi.payment_details(trans_id)   # network, OUTSIDE the lock
    with atomic():
        order = Order.objects.select_for_update().get(...)
        if order.settled_at:  # read INSIDE the lock
            return ALREADY
        ...
        db_transaction.on_commit(...)

The Fapshi call stays outside the lock deliberately: it can take 15 seconds, and
a locked order row held for 15 seconds blocks the checkout path that created it.
Asking Fapshi first also means the answer is Fapshi's, never the caller's — which
is what lets the webhook stay unauthenticated. A forged POST can at most make
Koraa re-ask Fapshi about a payment that already exists.
"""

import logging
from datetime import timezone as dt_timezone
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction as db_transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.merchants.models import MerchantPayoutAccount
from apps.notifications.models import Notification
from apps.payments import fapshi

from . import downloads, invoices
from .models import Order

logger = logging.getLogger(__name__)

#: Share of each order Koraa keeps. Read from settings the same way
#: ``orders.views`` reads it, and for the same reason: the rate is a business
#: decision, not a constant.
PLATFORM_COMMISSION_RATE = Decimal(
    str(getattr(settings, "KORAA_PLATFORM_COMMISSION_RATE", 0.05))
)

# Results. Strings rather than an enum because they cross into HTTP responses and
# management-command output, and a caller matching on them should not need an
# import.
PAID = "paid"
FAILED = "failed"
PENDING = "pending"
ALREADY = "already"
#: Fapshi could not be reached. Nothing was changed and the order is still
#: settleable — this is emphatically not a failed payment.
UNKNOWN = "unknown"


def settle_order(order_id, *, details=None) -> str:
    """Bring one storefront order in line with what Fapshi says happened.

    Safe to call repeatedly and concurrently: the second caller returns
    ``ALREADY`` without paying anyone twice.

    ``details`` lets a caller that has *already* fetched the payment from Fapshi
    pass it in rather than spending a second call — ``reconcile_orders`` walks a
    batch and Fapshi rate-limits status checks to six per minute per transaction.
    It must be a body Fapshi returned; nothing here trusts a caller-supplied
    status, because that would hand the webhook the power to declare a payment
    successful.

    Returns one of ``PAID``, ``FAILED``, ``PENDING``, ``ALREADY``, ``UNKNOWN``.
    """
    try:
        order = Order.objects.only("id", "settled_at", "fapshi_trans_id").get(
            pk=order_id
        )
    except Order.DoesNotExist:
        logger.warning("settle_order called for unknown order %s", order_id)
        return UNKNOWN

    # Cheap pre-check outside the lock. Not the guarantee — the one inside the
    # transaction is — but it keeps an already-settled order from costing a
    # Fapshi call and a row lock on every poll, which is what the browser does
    # every two seconds.
    if order.settled_at:
        return ALREADY

    if not order.fapshi_trans_id:
        # No payment was ever initiated, so there is nothing to ask about. Left
        # pending rather than failed: the buyer may still be mid-checkout.
        return PENDING

    if details is None:
        try:
            details = fapshi.payment_details(order.fapshi_trans_id)
        except fapshi.FapshiUnavailable:
            # The one branch that must change nothing at all. Money may well have
            # moved; a row left pending can be settled later, whereas a row
            # wrongly marked failed has lost the fact that it was paid.
            logger.warning(
                "Fapshi unreachable while settling order %s; left pending", order_id
            )
            return UNKNOWN
        except fapshi.FapshiRejected:
            # Fapshi says the request was wrong — most often an unknown transId,
            # which means our record points at a payment Fapshi has no idea
            # about. Retrying cannot fix that, but inventing a failure would be
            # worse, so it stays pending and visible for a human.
            logger.exception("Fapshi rejected a status check for order %s", order_id)
            return UNKNOWN

    status = (details.get("status") or "").upper()

    if status == fapshi.STATUS_SUCCESSFUL:
        return _settle_paid(order_id, details)

    if status in fapshi.UNSUCCESSFUL_STATUSES:
        # FAILED and EXPIRED both land on PaymentStatus.FAILED — the outcome for
        # the buyer is identical. The distinction survives in `fapshi_status`.
        return _settle_failed(order_id, details)

    # CREATED or PENDING: the buyer has not finished approving on their handset.
    # Recorded but not settled, so polling continues.
    Order.objects.filter(pk=order_id, settled_at__isnull=True).update(
        fapshi_status=status
    )
    return PENDING


def _settle_paid(order_id, details: dict) -> str:
    """Mark an order paid and schedule everything that follows from that."""
    with db_transaction.atomic():
        order = (
            Order.objects.select_for_update()
            .select_related("store", "store__merchant", "store__merchant__user")
            .get(pk=order_id)
        )

        # The real guard. Any concurrent caller is queued behind the lock above
        # and arrives here to find the work already done.
        if order.settled_at:
            return ALREADY

        now = timezone.now()
        order.payment_status = Order.PaymentStatus.PAID
        order.fapshi_status = fapshi.STATUS_SUCCESSFUL
        order.settled_at = now
        order.paid_at = _parse_confirmed(details.get("dateConfirmed")) or now
        order.financial_trans_id = str(details.get("financialTransId") or "")[:100]
        order.fapshi_revenue = _to_decimal(details.get("revenue"))
        order.save(
            update_fields=[
                "payment_status",
                "fapshi_status",
                "settled_at",
                "paid_at",
                "financial_trans_id",
                "fapshi_revenue",
                "updated_at",
            ]
        )

        # Everything below the commit line. An invoice for an order that rolled
        # back is not retractable, and neither is a payout.
        db_transaction.on_commit(lambda: _after_paid(order.pk))

    logger.info("Order %s settled as paid", order_id)
    return PAID


def _settle_failed(order_id, details: dict) -> str:
    """Record a payment Fapshi says did not happen."""
    raw_status = (details.get("status") or "").upper()

    with db_transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order_id)
        if order.settled_at:
            return ALREADY

        order.payment_status = Order.PaymentStatus.FAILED
        order.fapshi_status = raw_status
        order.settled_at = timezone.now()
        # Nothing was collected, so nothing is owed to the merchant. Saying so
        # explicitly keeps the order out of the payout retry queries.
        order.payout_status = Order.PayoutStatus.NOT_APPLICABLE
        order.save(
            update_fields=[
                "payment_status",
                "fapshi_status",
                "settled_at",
                "payout_status",
                "updated_at",
            ]
        )

    logger.info("Order %s settled as failed (Fapshi: %s)", order_id, raw_status)
    return FAILED


# ── After the money is confirmed ──────────────────────────────────────────────
#
# Everything here runs in ``on_commit``, i.e. after the order is durably paid.
# That ordering matters in both directions: nothing below can be undone by a
# rollback, and nothing below is allowed to undo the settlement either. So each
# step catches its own exceptions. A merchant email that bounces must not stop
# the buyer getting their download links, and none of it must raise into the
# webhook — Fapshi reads a 500 as "deliver again", and the parts that already
# succeeded would then run twice.


def _after_paid(order_id) -> None:
    """Payout, notification, emails, invoice and download grants."""
    try:
        order = Order.objects.select_related(
            "store", "store__merchant", "store__merchant__user"
        ).get(pk=order_id)
    except Order.DoesNotExist:  # pragma: no cover - the row was just committed
        logger.error("Order %s vanished before its side effects ran", order_id)
        return

    pay_merchant(order)
    _notify_merchant(order)

    # Both of these are documented as never raising, but they are the two steps
    # the buyer actually paid for, so neither is trusted to be well-behaved.
    for step, run in (("invoice", invoices.send_invoice), ("downloads", downloads.send_downloads)):
        try:
            run(order)
        except Exception:
            logger.exception("Order %s: %s step failed", order_id, step)


def pay_merchant(order: Order) -> None:
    """Send the merchant their share, and record what happened either way.

    Public because it has two callers: settlement, on the way through
    ``_after_paid``, and ``reconcile_orders --retry-payouts`` for the orders where
    that first attempt did not land. Both need identical arithmetic and identical
    bookkeeping, which is the entire reason this is one function.

    The amount is the merchant's cut of what Koraa actually *received* when
    Fapshi told us — ``revenue``, the charge less Fapshi's own fee — falling back
    to the order total on rows settled before that was recorded. Paying a share
    of the gross would mean paying out more than came in whenever Fapshi's fee
    exceeds the platform commission.

    Never raises, and never retries *itself*. Fapshi's own documentation warns
    that misuse can suspend an account, and a retry whose first attempt actually
    succeeded pays the merchant twice. A failure is written down for
    ``reconcile_orders --retry-payouts`` to pick up deliberately — which is a
    human choosing to retry, not this function looping.

    Not idempotent, and cannot be: Fapshi's payout endpoint has no idempotency
    key, so there is no way to ask "did this externalId already pay out" before
    sending. The protection is that the only automatic caller runs inside
    ``settled_at``'s once-only guard, and the manual caller refuses any order
    whose ``payout_status`` is ``sent`` or ``unknown``.
    """
    merchant = order.store.merchant
    account = (
        MerchantPayoutAccount.objects.filter(merchant=merchant)
        .order_by("-is_default", "created_at")
        .first()
    )

    if account is None:
        logger.warning(
            "Order %s paid but merchant %s has no payout account", order.id, merchant.id
        )
        _record_payout(
            order,
            status=Order.PayoutStatus.FAILED,
            error="Merchant has no payout account on file",
        )
        return

    basis = order.fapshi_revenue if order.fapshi_revenue is not None else order.total_amount
    net = (Decimal(basis) * (Decimal("1") - PLATFORM_COMMISSION_RATE)).to_integral_value()

    if net < fapshi.min_amount():
        # Fapshi will not move a sum below its floor, so calling would only
        # produce a rejection. NOT_APPLICABLE rather than FAILED: nothing is
        # wrong and there is nothing to retry.
        logger.info(
            "Order %s: merchant share %s is below the Fapshi minimum; no payout",
            order.id, net,
        )
        _record_payout(
            order,
            status=Order.PayoutStatus.NOT_APPLICABLE,
            amount=net,
            error="Below the Fapshi minimum payout",
        )
        return

    try:
        reference = fapshi.payout(
            phone=account.phone, amount=net, external_id=str(order.id)
        )
    except fapshi.FapshiRejected as exc:
        # Fapshi refused. No money moved, so this is safely retryable once the
        # cause — usually a bad payout number — is fixed.
        logger.error("Order %s: Fapshi refused the merchant payout: %s", order.id, exc)
        _record_payout(
            order, status=Order.PayoutStatus.FAILED, amount=net, error=str(exc)[:255]
        )
    except fapshi.FapshiUnavailable as exc:
        # The dangerous one: the request may have been accepted before the
        # connection dropped. UNKNOWN keeps it out of the retry query, because
        # the cost of retrying a payout that did land is paying twice.
        logger.error(
            "Order %s: merchant payout outcome unknown, verify in Fapshi: %s",
            order.id, exc,
        )
        _record_payout(
            order, status=Order.PayoutStatus.UNKNOWN, amount=net, error=str(exc)[:255]
        )
    else:
        _record_payout(
            order, status=Order.PayoutStatus.SENT, amount=net, reference=reference
        )


def _record_payout(order, *, status, amount=None, reference="", error="") -> None:
    """Write the payout outcome. Uses ``update()`` to touch nothing else."""
    Order.objects.filter(pk=order.pk).update(
        payout_status=status,
        payout_amount=amount,
        payout_reference=reference or "",
        payout_error=error or "",
        payout_at=timezone.now(),
    )


def _notify_merchant(order: Order) -> None:
    """In-app notification and the "you have a sale" email."""
    merchant = order.store.merchant
    try:
        Notification.objects.create(
            recipient=merchant.user,
            type=Notification.Type.ORDER_PLACED,
            title="New Order Received!",
            body=(
                f"You received an order of {order.total_amount} XAF "
                f"from {order.customer_name}."
            ),
            data={"order_id": str(order.id)},
        )
    except Exception:
        logger.exception("Order %s: could not create the merchant notification", order.id)

    send_mail(
        subject=f"New Order Received: {order.store.name}",
        message=(
            f"You received a new order from {order.customer_name} "
            f"for {order.total_amount} XAF.\n\nCheck your dashboard for details."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[merchant.user.email],
        fail_silently=True,
    )


# ── Parsing Fapshi's extras ───────────────────────────────────────────────────
#
# Both helpers return None rather than raising. These fields are for the audit
# trail; a surprise in one of them must not cost a settlement.


def _to_decimal(value):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        logger.warning("Fapshi sent an unparseable amount: %r", value)
        return None


def _parse_confirmed(value):
    """Fapshi's ``dateConfirmed`` as an aware datetime, or None."""
    if not value:
        return None
    parsed = parse_datetime(str(value))
    if parsed is None:
        logger.warning("Fapshi sent an unparseable dateConfirmed: %r", value)
        return None
    if timezone.is_naive(parsed):
        # Fapshi timestamps are UTC. ``django.utils.timezone.utc`` was removed in
        # Django 5, hence the stdlib one.
        return timezone.make_aware(parsed, dt_timezone.utc)
    return parsed
