"""Finding payments that were taken but never settled, and finishing them.

This is not a nice-to-have sweep. **Fapshi delivers each webhook once and never
retries**, so any notification lost to a deploy, a restart, a network blip or a
non-2xx from Koraa is lost for good. Without a pass like this one, a buyer whose
webhook went missing has paid and owns nothing: no invoice, no download link, and
no money forwarded to the merchant. That is why the beat schedule for
``reconcile_pending`` is part of the design rather than an optimisation — it is
the only backstop under the whole storefront.

Two operations, deliberately separate:

``reconcile_pending``
    Read-mostly and safe to run on a timer. It asks Fapshi about orders that are
    still pending and hands each answer to ``settlement.settle_order``, which is
    idempotent by construction. Nothing here decides an outcome; Fapshi does.

``retry_failed_payouts``
    **Moves money**, so it is never scheduled and never bundled into the pass
    above. It is a human deciding to re-send a payout that Koraa knows did not
    go out.

The split matters because the failure modes are opposite. Re-asking Fapshi about
a payment costs nothing if it is wrong. Re-sending a payout that actually
succeeded pays a merchant twice out of Koraa's own float, and there is no
Fapshi-side idempotency key to prevent it — which is why
``payout_status=unknown`` is excluded from the retry set below and why that
exclusion has a test.
"""

import logging
from dataclasses import dataclass, field
from datetime import timedelta

from django.utils import timezone

from apps.payments import fapshi

from . import settlement
from .models import Order

logger = logging.getLogger(__name__)

#: How long an order must have been pending before a sweep touches it.
#:
#: Not zero, for two reasons. A buyer approving a charge on their handset is
#: legitimately pending for a minute or two, and the browser is polling the whole
#: time — Fapshi allows six status calls per minute *per transaction* and a
#: reconcile pass asking about the same transaction would eat into that budget.
#: Fifteen minutes puts the sweep well clear of the frontend's three-minute hard
#: stop, so the two never contend for the same allowance.
DEFAULT_OLDER_THAN_MINUTES = 15

#: Ceiling on one pass. A sweep is a background job, and one Fapshi call per
#: order means a batch of a thousand would run for minutes and hold a worker.
#: Whatever it does not reach, the next pass picks up — oldest first, so nothing
#: starves.
DEFAULT_LIMIT = 200

#: Payout states a retry may act on.
#:
#: ``pending`` means the payout was never attempted at all — the order committed
#: but its ``on_commit`` side effects did not run, which is what a process killed
#: mid-settle looks like. ``failed`` means Fapshi refused, so no money moved.
#:
#: ``unknown`` is excluded on purpose and must stay excluded: it means Fapshi
#: accepted the payout and then the connection died, so the money may already be
#: with the merchant. Retrying blind pays twice. Those need a human against the
#: Fapshi dashboard, and the admin surfaces them for exactly that.
RETRYABLE_PAYOUT_STATUSES = (
    Order.PayoutStatus.PENDING,
    Order.PayoutStatus.FAILED,
)


@dataclass
class ReconcileReport:
    """What one pass over the pending orders did."""

    examined: int = 0
    paid: int = 0
    failed: int = 0
    still_pending: int = 0
    #: Fapshi could not be reached for these, so nothing about them was changed.
    #: The command exits non-zero when this is non-empty: an unattended sweep
    #: that quietly gives up on real money is how the current backlog happened.
    unreachable: int = 0
    order_ids: list = field(default_factory=list)

    @property
    def settled(self) -> int:
        return self.paid + self.failed

    def summary(self) -> str:
        return (
            f"examined {self.examined}, paid {self.paid}, failed {self.failed}, "
            f"still pending {self.still_pending}, unreachable {self.unreachable}"
        )


@dataclass
class PayoutReport:
    """What one payout retry pass did."""

    examined: int = 0
    sent: int = 0
    failed: int = 0
    #: Refused before calling Fapshi — below its floor, or no payout account.
    skipped: int = 0
    unresolved: int = 0

    def summary(self) -> str:
        return (
            f"examined {self.examined}, sent {self.sent}, failed {self.failed}, "
            f"skipped {self.skipped}, unresolved {self.unresolved}"
        )


def pending_orders(
    *, older_than_minutes: int = DEFAULT_OLDER_THAN_MINUTES, limit: int = DEFAULT_LIMIT
):
    """Orders that were paid for as far as we know, and never resolved.

    ``settled_at__isnull=True`` rather than only ``payment_status=PENDING``:
    those agree today, but ``settled_at`` is the marker settlement actually
    honours, and a sweep that disagreed with it would re-run side effects.

    An order with no ``fapshi_trans_id`` is skipped — there is no payment to ask
    about, only an abandoned basket.
    """
    cutoff = timezone.now() - timedelta(minutes=older_than_minutes)
    return (
        Order.objects.filter(
            payment_status=Order.PaymentStatus.PENDING,
            settled_at__isnull=True,
            created_at__lte=cutoff,
        )
        .exclude(fapshi_trans_id__isnull=True)
        .exclude(fapshi_trans_id="")
        .order_by("created_at")[:limit]
    )


def reconcile_pending(
    *,
    older_than_minutes: int = DEFAULT_OLDER_THAN_MINUTES,
    limit: int = DEFAULT_LIMIT,
    dry_run: bool = False,
) -> ReconcileReport:
    """Ask Fapshi about every stuck order and settle whatever it confirms.

    Idempotent by construction: every write goes through
    ``settlement.settle_order``, whose ``settled_at`` guard under
    ``select_for_update`` is what stops a sweep racing a webhook. Running this
    twice in a row, or alongside a browser poll, cannot pay a merchant twice.

    ``dry_run`` still calls Fapshi — that is the only way to know what a real run
    would do — but writes nothing. It is safe: a status check moves no money.
    """
    report = ReconcileReport()

    for order in pending_orders(older_than_minutes=older_than_minutes, limit=limit):
        report.examined += 1
        report.order_ids.append(str(order.id))

        if dry_run:
            _classify_dry_run(order, report)
            continue

        result = settlement.settle_order(order.id)
        if result == settlement.PAID:
            report.paid += 1
            logger.info("reconcile: order %s settled as paid", order.id)
        elif result == settlement.FAILED:
            report.failed += 1
        elif result == settlement.UNKNOWN:
            report.unreachable += 1
        else:
            # PENDING (buyer still hasn't approved) or ALREADY (a webhook or a
            # poll got there between the query and now — the expected race, and
            # proof the guard works).
            report.still_pending += 1

    return report


def _classify_dry_run(order, report: ReconcileReport) -> None:
    """What ``settle_order`` would have concluded, without writing anything."""
    try:
        status = fapshi.payment_status(order.fapshi_trans_id)
    except fapshi.FapshiUnavailable:
        report.unreachable += 1
        return
    except fapshi.FapshiRejected:
        # Fapshi has never heard of this transaction id. A real run leaves it
        # pending too, but it deserves a human's attention rather than a counter,
        # because it means a Koraa record points at a payment that does not exist.
        logger.warning(
            "reconcile: Fapshi rejected the status check for order %s (transId %s)",
            order.id, order.fapshi_trans_id,
        )
        report.unreachable += 1
        return

    if status == fapshi.STATUS_SUCCESSFUL:
        report.paid += 1
    elif status in fapshi.UNSUCCESSFUL_STATUSES:
        report.failed += 1
    else:
        report.still_pending += 1


def payout_backlog(*, limit: int = 50):
    """Paid orders whose merchant has provably not been paid.

    Constrained to ``settled_at__isnull=False`` as well as ``PAID``: a payout for
    an order that has not completed settlement would be paying out against a
    payment whose amount is not final.
    """
    return (
        Order.objects.filter(
            payment_status=Order.PaymentStatus.PAID,
            settled_at__isnull=False,
            payout_status__in=RETRYABLE_PAYOUT_STATUSES,
        )
        .select_related("store", "store__merchant", "store__merchant__user")
        .order_by("settled_at")[:limit]
    )


def retry_failed_payouts(*, limit: int = 50, dry_run: bool = False) -> PayoutReport:
    """Re-send the payouts Koraa knows did not go out. **Moves money.**

    Only ever called deliberately — never from the beat schedule. See
    ``RETRYABLE_PAYOUT_STATUSES`` for why ``unknown`` is not in scope: this
    function is safe precisely because every order it touches is one where no
    money left Koraa.
    """
    report = PayoutReport()

    for order in payout_backlog(limit=limit):
        report.examined += 1

        if dry_run:
            report.sent += 1  # what would be attempted
            continue

        settlement.pay_merchant(order)
        order.refresh_from_db(fields=["payout_status"])

        if order.payout_status == Order.PayoutStatus.SENT:
            report.sent += 1
        elif order.payout_status == Order.PayoutStatus.UNKNOWN:
            report.unresolved += 1
        elif order.payout_status == Order.PayoutStatus.NOT_APPLICABLE:
            report.skipped += 1
        else:
            report.failed += 1

    return report
