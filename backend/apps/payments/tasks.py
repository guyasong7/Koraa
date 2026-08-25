"""Celery tasks for the subscription lifecycle.

Thin wrappers: the logic lives in ``lifecycle`` so that ``manage.py
sync_subscriptions`` and the tests can run it without a broker.
"""

from celery import shared_task

from . import lifecycle


@shared_task(name="payments.warn_expiring_subscriptions")
def warn_expiring_subscriptions(days: int = lifecycle.WARNING_DAYS) -> int:
    return lifecycle.warn_expiring_subscriptions(days=days)


@shared_task(name="payments.expire_lapsed_subscriptions")
def expire_lapsed_subscriptions() -> int:
    return lifecycle.expire_lapsed_subscriptions()
