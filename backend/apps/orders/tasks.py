"""Celery tasks for order settlement.

Thin wrapper, matching ``apps.payments.tasks``: the logic lives in
``apps.orders.reconcile`` so that ``manage.py reconcile_orders`` and the tests can
run it without a broker.

There is deliberately **no task for payout retries**. Retrying a payout moves
money and Fapshi's payout endpoint has no idempotency key, so it stays a
human-initiated command. A scheduled version of it would be one bad deploy away
from paying every merchant twice.
"""

import logging

from celery import shared_task

from . import reconcile

logger = logging.getLogger(__name__)


@shared_task(name="orders.reconcile_pending")
def reconcile_pending(
    older_than_minutes: int = reconcile.DEFAULT_OLDER_THAN_MINUTES,
    limit: int = reconcile.DEFAULT_LIMIT,
) -> dict:
    """Settle storefront orders whose Fapshi webhook never arrived.

    Fapshi delivers each webhook once and never retries, so this is the only
    backstop under the storefront — not an optimisation. Idempotent: every write
    goes through ``settlement.settle_order``.

    Returns a dict rather than the report object because Celery has to serialise
    the result to JSON.
    """
    report = reconcile.reconcile_pending(
        older_than_minutes=older_than_minutes, limit=limit
    )

    if report.paid or report.failed:
        logger.info("reconcile_pending: %s", report.summary())
    if report.unreachable:
        # Logged at error level rather than raising: the task did its job and the
        # orders are untouched and still queued. A raise would retry the whole
        # batch, re-asking Fapshi about orders that answered fine — and Fapshi
        # rate-limits status checks per transaction.
        logger.error(
            "reconcile_pending: Fapshi unreachable for %s order(s); retrying next pass",
            report.unreachable,
        )

    return {
        "examined": report.examined,
        "paid": report.paid,
        "failed": report.failed,
        "still_pending": report.still_pending,
        "unreachable": report.unreachable,
    }
