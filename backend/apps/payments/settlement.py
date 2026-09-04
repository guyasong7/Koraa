"""Turning a plan payment into an active subscription, exactly once.

The one place a subscription becomes active. Three callers reach it — the
dashboard polling ``/payments/callback/``, Fapshi's webhook, and
``payments.reconcile_pending`` — and they must not be able to disagree, which is
the whole reason this is a module and not a method on a view.

It lived in ``views.py`` until direct-pay needed a reconcile sweep. A sweep
importing a DRF view to settle a payment would have inverted the layering, so the
settle path moved out and ``views.py`` now imports it like everyone else. This
mirrors ``apps.orders.settlement``, deliberately: the two money paths have the
same shape and the same hazards, and someone reading one should recognise the
other.

**The Fapshi status is always fetched from Fapshi, never taken from the caller.**
That is what makes an unauthenticated webhook safe: a forged POST can at most
make Koraa re-ask about a payment that already exists.

Two invariants worth stating outright, because both were once broken here:

*Idempotency is enforced by ``settled_at`` under a row lock*, not by reading a
status field first. The guard used to be ``if tx.status == SUCCESSFUL`` read
outside the transaction and with no lock, so a webhook arriving while the browser
polled let both callers through — adding two years to a term for one payment and
paying the referral bonus twice.

*An outage is not a failure.* ``check_fapshi_status`` raises rather than
answering ``"FAILED"`` when Fapshi cannot be reached. Its predecessor returned
``"FAILED"`` for any non-200 and every caller believed it, so a bad minute at
Fapshi cancelled live subscriptions for payments that had gone through. A caller
must treat ``UNKNOWN`` as "change nothing and ask again later".
"""

import logging
from datetime import timedelta

from django.db import transaction as db_transaction
from django.utils import timezone

from . import fapshi
from .models import PaymentTransaction, Subscription

logger = logging.getLogger(__name__)

#: Term length per cycle, in days. Both cycles are sold: ``price_monthly`` is a
#: tenth of ``price_yearly``, so the two-months-free discount lives in the
#: annual price rather than in a rule here.
#:
#: Monthly was withdrawn for a while and has been restored. Rows bought in
#: either period settle correctly without a migration, because the cycle was
#: always stored on the subscription rather than inferred from the amount.
#:
#: Keep in step with ``plans.CYCLES``: a cycle that can be bought but has no
#: term length here falls through the ``.get`` below and silently settles as 30
#: days, which on a yearly purchase means charging for a year and granting a
#: month.
CYCLE_DAYS = {"monthly": 30, "yearly": 365}

# ── Verdicts ─────────────────────────────────────────────────────────────────
#
# The strings are the ones the webhook and the callback have always returned, so
# they are a published contract and not free to rename. Named here so a caller
# branches on a constant rather than a literal.

#: The plan is active. Also returned when a concurrent caller got there first —
#: from the caller's point of view those are the same outcome.
ACTIVATED = "activated"

#: Fapshi says the money did not move, and the row is now settled as such.
FAILED = "failed"

#: The merchant has not approved the prompt on their handset yet. Nothing is
#: wrong; ask again.
PENDING = "pending"

#: Fapshi could not be reached, so **nothing was changed**. Not a failure, and a
#: caller must never present it as one — see the module docstring.
UNKNOWN = "unknown"


def check_fapshi_status(trans_id: str) -> str:
    """Fapshi's status for a transaction.

    Raises ``FapshiUnavailable`` rather than returning ``"FAILED"`` when Fapshi
    cannot be reached — see the module docstring. Callers must not treat an
    exception here as a failed payment.
    """
    return fapshi.payment_status(trans_id)


def settle_transaction(tx: PaymentTransaction) -> str:
    """Ask Fapshi what happened to ``tx`` and bring our records in line.

    Idempotent and concurrency-safe: every write below happens under
    ``select_for_update`` in the same transaction as the ``settled_at`` stamp, so
    a second caller queues on the lock and finds the work done.

    Returns ``ACTIVATED``, ``FAILED``, ``PENDING`` or ``UNKNOWN``.
    """
    try:
        fapshi_status_str = check_fapshi_status(tx.fapshi_trans_id)
    except fapshi.FapshiUnavailable:
        # The bug this replaces returned "FAILED" here, and callers believed it:
        # an outage cancelled live subscriptions for payments that had gone
        # through. Leaving the row alone keeps it settleable by a later pass.
        logger.warning(
            "Fapshi unreachable while settling transaction %s; left pending",
            tx.fapshi_trans_id,
        )
        return UNKNOWN
    except fapshi.FapshiRejected:
        # Fapshi has never heard of this transaction id, or our credentials are
        # wrong. Neither is a statement about the money, so neither may settle
        # the row — but it does mean a Koraa record points at a payment that may
        # not exist, which is why this logs at exception level.
        logger.exception(
            "Fapshi rejected a status check for transaction %s", tx.fapshi_trans_id
        )
        return UNKNOWN

    if fapshi_status_str == fapshi.STATUS_SUCCESSFUL:
        return activate_subscription(tx.pk, fapshi_status_str)

    if fapshi_status_str in fapshi.UNSUCCESSFUL_STATUSES:
        return fail_transaction(tx.pk, fapshi_status_str)

    # CREATED or PENDING — the merchant has not approved on their handset yet.
    # Recorded so the admin shows how far a charge got, and guarded on
    # ``settled_at`` so a stale poll cannot overwrite a settled row's status.
    PaymentTransaction.objects.filter(pk=tx.pk, settled_at__isnull=True).update(
        fapshi_status=fapshi_status_str
    )
    return PENDING


def activate_subscription(tx_pk, fapshi_status_str: str) -> str:
    """Give the buyer the plan they paid for, exactly once."""
    with db_transaction.atomic():
        tx = (
            PaymentTransaction.objects.select_for_update()
            .select_related("subscription", "user")
            .get(pk=tx_pk)
        )

        # The real guard: any concurrent caller queues on the lock above and
        # arrives here to find the work done.
        if tx.settled_at:
            return ACTIVATED

        now = timezone.now()
        tx.status = PaymentTransaction.Status.SUCCESSFUL
        tx.fapshi_status = fapshi_status_str
        tx.settled_at = now
        tx.save(update_fields=["status", "fapshi_status", "settled_at", "updated_at"])

        sub = tx.subscription
        merchant = getattr(tx.user, "merchant", None)

        # Renewing before the current term ends adds the new term to what is
        # left rather than throwing it away. The expiry warning goes out a week
        # early precisely to invite this, so charging for a full term and handing
        # back that term minus the unused remainder would be theft. Note the
        # cycle bought is the cycle added: a monthly renewal on a yearly term
        # adds 30 days to it, which is the merchant's choice to make.
        current_expiry = getattr(merchant, "tier_expires_at", None)
        base = current_expiry if current_expiry and current_expiry > now else now

        sub.status = Subscription.Status.ACTIVE
        sub.starts_at = now
        sub.expires_at = base + timedelta(days=CYCLE_DAYS.get(sub.billing_cycle, 30))
        # A fresh term has not been warned about yet.
        sub.expiry_notice_sent_at = None
        sub.save()

        # Any earlier paid plan is superseded by the one just bought.
        Subscription.objects.filter(
            user=tx.user, status=Subscription.Status.ACTIVE
        ).exclude(pk=sub.pk).update(status=Subscription.Status.CANCELLED)

        if merchant is not None:
            merchant.tier = sub.plan
            merchant.tier_expires_at = sub.expires_at
            merchant.save(update_fields=["tier", "tier_expires_at"])
        else:
            logger.warning(
                "Payment %s settled for user %s with no merchant profile",
                tx.fapshi_trans_id, tx.user_id,
            )

        # Referral payout: 2% of the first plan payment the referred user makes.
        from apps.accounts.models import Referral
        pending_ref = Referral.objects.filter(
            referred_user=tx.user, status=Referral.Status.PENDING
        ).first()
        if pending_ref:
            pending_ref.reward_amount = int(tx.amount * 0.02)
            pending_ref.status = Referral.Status.COMPLETED
            pending_ref.save(update_fields=["reward_amount", "status"])

    return ACTIVATED


def fail_transaction(tx_pk, fapshi_status_str: str) -> str:
    """Record a subscription payment Fapshi says did not happen.

    Locked for the same reason the success path is: a concurrent activation must
    not be overwritten by a stale failure verdict.
    """
    with db_transaction.atomic():
        tx = (
            PaymentTransaction.objects.select_for_update()
            .select_related("subscription")
            .get(pk=tx_pk)
        )
        if tx.settled_at:
            return (
                ACTIVATED
                if tx.status == PaymentTransaction.Status.SUCCESSFUL
                else FAILED
            )

        tx.status = (
            PaymentTransaction.Status.EXPIRED
            if fapshi_status_str == fapshi.STATUS_EXPIRED
            else PaymentTransaction.Status.FAILED
        )
        tx.fapshi_status = fapshi_status_str
        tx.settled_at = timezone.now()
        tx.save(update_fields=["status", "fapshi_status", "settled_at", "updated_at"])

        if tx.subscription and tx.subscription.status == Subscription.Status.PENDING:
            tx.subscription.status = Subscription.Status.CANCELLED
            tx.subscription.save(update_fields=["status"])

    return FAILED
