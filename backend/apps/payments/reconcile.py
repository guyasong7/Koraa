"""Finding plan payments that were taken but never settled, and finishing them.

The subscription counterpart to ``apps.orders.reconcile``, and it exists for the
same reason: **Fapshi delivers each webhook once and never retries.** A
notification lost to a deploy, a restart or a network blip is lost for good.

Direct-pay makes this a requirement rather than a safety net. The old hosted-page
flow bounced the merchant back to ``/dashboard/billing/success``, and that return
trip triggered the only status check Koraa ever made — so the browser was, in
practice, the backstop. There is no return trip now: the merchant approves a
prompt on their handset and the tab they started from is the only thing watching.
Close it before the prompt is approved and, without this sweep, a merchant has
paid for a term and holds a PENDING row.

Read-only against Fapshi and safe to run on a timer. It decides nothing itself —
every write goes through ``settlement.settle_transaction``, whose ``settled_at``
guard under ``select_for_update`` is what stops a sweep racing a webhook or a
browser poll. There is no payout counterpart here: a plan payment moves money to
Koraa, not out of it, so nothing in this module can pay anyone twice.
"""

import logging
from dataclasses import dataclass, field
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from . import fapshi, settlement
from .models import PaymentTransaction, Subscription

logger = logging.getLogger(__name__)

#: How long a transaction must have been pending before a sweep touches it.
#:
#: Not zero, and the number is not arbitrary. A merchant approving a charge is
#: legitimately pending for a minute or two and the dashboard is polling the whole
#: time; Fapshi allows six status calls a minute *per transaction* and a sweep
#: asking about the same one would eat into that budget. Fifteen minutes puts this
#: well clear of the frontend's three-minute hard stop, so the two never contend.
DEFAULT_OLDER_THAN_MINUTES = 15

#: Ceiling on one pass. One Fapshi call per transaction, so an unbounded batch
#: would hold a worker for minutes. Whatever this does not reach, the next pass
#: picks up — oldest first, so nothing starves.
DEFAULT_LIMIT = 200


@dataclass
class ReconcileReport:
    """What one pass over the pending plan payments did."""

    examined: int = 0
    activated: int = 0
    failed: int = 0
    still_pending: int = 0
    #: Fapshi could not be reached for these, so nothing about them was changed.
    #: The command exits non-zero when this is non-empty: an unattended sweep that
    #: quietly gives up on real money is the failure mode this whole module is here
    #: to prevent.
    unreachable: int = 0
    #: PENDING subscriptions with no ``transId`` at all — the residue of a charge
    #: Fapshi never confirmed (see the ``FapshiUnavailable`` branch of
    #: ``InitiatePaymentView``). **Nothing here can be settled automatically:**
    #: with no transaction id there is nothing to ask Fapshi about, and the charge
    #: may or may not exist. Counted, never touched, so a human has a number to
    #: reconcile against the Fapshi dashboard.
    unfollowable: int = 0
    trans_ids: list = field(default_factory=list)

    @property
    def settled(self) -> int:
        return self.activated + self.failed

    def summary(self) -> str:
        return (
            f"examined {self.examined}, activated {self.activated}, "
            f"failed {self.failed}, still pending {self.still_pending}, "
            f"unreachable {self.unreachable}, unfollowable {self.unfollowable}"
        )


def pending_transactions(
    *, older_than_minutes: int = DEFAULT_OLDER_THAN_MINUTES, limit: int = DEFAULT_LIMIT
):
    """Plan payments that were charged as far as we know, and never resolved.

    Selected on ``settled_at__isnull=True`` rather than on ``status``:
    ``settled_at`` is the marker activation actually honours, and a sweep that
    disagreed with it would re-run the activation — extending a term twice and
    paying the referral bonus twice.
    """
    cutoff = timezone.now() - timedelta(minutes=older_than_minutes)
    return (
        PaymentTransaction.objects.filter(
            settled_at__isnull=True,
            created_at__lte=cutoff,
        )
        .exclude(fapshi_trans_id="")
        .select_related("subscription", "user")
        .order_by("created_at")[:limit]
    )


def unfollowable_subscriptions(*, older_than_minutes: int = DEFAULT_OLDER_THAN_MINUTES):
    """PENDING subscriptions that have no payment to ask Fapshi about.

    Two things land here, and only one is a problem. A charge Fapshi accepted
    without confirming leaves a subscription with no ``transId`` and possibly a
    real debit behind it — that needs a human. A charge Fapshi *refused* deletes
    its subscription outright, so those never reach this query.
    """
    cutoff = timezone.now() - timedelta(minutes=older_than_minutes)
    return Subscription.objects.filter(
        # Null and empty both occur: the column is `blank=True, null=True` and
        # has been written both ways over its life.
        Q(fapshi_trans_id__isnull=True) | Q(fapshi_trans_id=""),
        status=Subscription.Status.PENDING,
        created_at__lte=cutoff,
    )


def reconcile_pending(
    *,
    older_than_minutes: int = DEFAULT_OLDER_THAN_MINUTES,
    limit: int = DEFAULT_LIMIT,
    dry_run: bool = False,
) -> ReconcileReport:
    """Ask Fapshi about every stuck plan payment and settle whatever it confirms.

    Idempotent by construction — see the module docstring. Running this twice in a
    row, or alongside a dashboard poll, cannot activate a plan twice.

    ``dry_run`` still calls Fapshi, because that is the only way to know what a
    real run would do, but writes nothing. Safe: a status check moves no money.
    """
    report = ReconcileReport()

    for tx in pending_transactions(older_than_minutes=older_than_minutes, limit=limit):
        report.examined += 1
        report.trans_ids.append(tx.fapshi_trans_id)

        if dry_run:
            _classify_dry_run(tx, report)
            continue

        result = settlement.settle_transaction(tx)
        if result == settlement.ACTIVATED:
            report.activated += 1
            logger.info(
                "reconcile: subscription %s activated from transaction %s",
                tx.subscription_id, tx.fapshi_trans_id,
            )
        elif result == settlement.FAILED:
            report.failed += 1
        elif result == settlement.UNKNOWN:
            report.unreachable += 1
        else:
            # PENDING — the merchant still has not approved. Expected, and the
            # next pass will ask again.
            report.still_pending += 1

    report.unfollowable = unfollowable_subscriptions(
        older_than_minutes=older_than_minutes
    ).count()
    if report.unfollowable:
        logger.warning(
            "reconcile: %s pending subscription(s) have no transId and cannot be "
            "settled automatically — a charge may exist for each. Check these "
            "against the Fapshi dashboard.",
            report.unfollowable,
        )

    return report


def _classify_dry_run(tx: PaymentTransaction, report: ReconcileReport) -> None:
    """What ``settle_transaction`` would have concluded, without writing."""
    try:
        status = fapshi.payment_status(tx.fapshi_trans_id)
    except fapshi.FapshiUnavailable:
        report.unreachable += 1
        return
    except fapshi.FapshiRejected:
        # Fapshi has never heard of this transaction id. A real run leaves it
        # pending too, but it deserves a human rather than a counter: it means a
        # Koraa row points at a payment that does not exist.
        logger.warning(
            "reconcile: Fapshi rejected the status check for transaction %s",
            tx.fapshi_trans_id,
        )
        report.unreachable += 1
        return

    if status == fapshi.STATUS_SUCCESSFUL:
        report.activated += 1
    elif status in fapshi.UNSUCCESSFUL_STATUSES:
        report.failed += 1
    else:
        report.still_pending += 1
