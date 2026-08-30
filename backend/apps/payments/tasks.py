"""Celery tasks for the subscription lifecycle and for settling stuck payments.

Thin wrappers: the logic lives in ``lifecycle`` and ``reconcile`` so that
``manage.py sync_subscriptions`` / ``manage.py reconcile_subscriptions`` and the
tests can run it without a broker.
"""

import logging

from celery import shared_task

from . import lifecycle, reconcile

logger = logging.getLogger(__name__)


@shared_task(name="payments.warn_expiring_subscriptions")
def warn_expiring_subscriptions(days: int = lifecycle.WARNING_DAYS) -> int:
    return lifecycle.warn_expiring_subscriptions(days=days)


@shared_task(name="payments.expire_lapsed_subscriptions")
def expire_lapsed_subscriptions() -> int:
    return lifecycle.expire_lapsed_subscriptions()


@shared_task(name="payments.reconcile_pending")
def reconcile_pending(
    older_than_minutes: int = reconcile.DEFAULT_OLDER_THAN_MINUTES,
    limit: int = reconcile.DEFAULT_LIMIT,
) -> dict:
    """Settle plan payments a lost webhook left stranded. See ``reconcile``.

    Returns the report as a dict rather than the dataclass: a task result is
    serialised to JSON, and the summary is what an operator reads in Flower.
    """
    report = reconcile.reconcile_pending(
        older_than_minutes=older_than_minutes, limit=limit
    )

    if report.settled:
        logger.info("payments.reconcile_pending: %s", report.summary())
    if report.unreachable:
        # Not an error — the next pass will ask again — but it means real money is
        # sitting unresolved, so it must be visible without reading a task result.
        logger.warning(
            "payments.reconcile_pending: Fapshi unreachable for %s transaction(s); "
            "retrying next pass",
            report.unreachable,
        )

    return {
        "examined": report.examined,
        "activated": report.activated,
        "failed": report.failed,
        "still_pending": report.still_pending,
        "unreachable": report.unreachable,
        "unfollowable": report.unfollowable,
    }
