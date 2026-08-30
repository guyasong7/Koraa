"""
Subscription lifecycle — the passage of time, as opposed to payment events.

``settlement.settle_transaction`` handles a merchant *buying* a plan. Nothing
handled a plan *running out*: ``Merchant.effective_tier`` quietly stopped
honouring a lapsed tier, which kept enforcement correct, but

  * the ``Subscription`` row stayed ``active`` forever,
  * ``Merchant.tier`` still named the paid plan,
  * and the merchant was told nothing — not before expiry, not after.

The two sweeps below close that gap. Both are idempotent and safe to run
as often as you like: ``expiry_notice_sent_at`` records the warning and the
transition itself is guarded by the subscription's own status, so a merchant
is never warned twice for the same term and never emailed twice about the
same expiry.

Run them from Celery beat (see ``CELERY_BEAT_SCHEDULE``) or by hand with
``manage.py sync_subscriptions`` — the management command exists because
local development runs without Redis.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction as db_transaction
from django.template.loader import render_to_string
from django.utils import timezone

from apps.merchants import plans as plan_catalogue
from apps.merchants.models import Merchant
from apps.notifications.models import Notification

from .models import Plan, Subscription

logger = logging.getLogger(__name__)

#: How far ahead a merchant is warned. One week, as promised in the email.
WARNING_DAYS = 7


def _billing_url() -> str:
    return f"{settings.KORAA_DASHBOARD_URL.rstrip('/')}/dashboard/billing"


def _recipient_name(user) -> str:
    return (getattr(user, "full_name", "") or user.email.split("@")[0]).strip()


def _send(template: str, subject: str, user, context: dict, text: str) -> None:
    """Send one lifecycle email, never letting SMTP break the sweep.

    ``fail_silently`` covers a refused connection, but a template or
    encoding error would still raise and abandon every merchant after this
    one, so the whole call is guarded.
    """
    try:
        send_mail(
            subject=subject,
            message=text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
            html_message=render_to_string(
                f"emails/{template}",
                {
                    **context,
                    "name": _recipient_name(user),
                    "dashboard_url": settings.KORAA_DASHBOARD_URL.rstrip("/"),
                    "billing_url": _billing_url(),
                },
            ),
        )
    except Exception:
        logger.exception("Failed to send %s to %s", template, user.email)


def _active_paid_subscription(user) -> Subscription | None:
    return (
        Subscription.objects.filter(user=user, status=Subscription.Status.ACTIVE)
        .exclude(plan=Plan.FREE)
        .order_by("-starts_at", "-id")
        .first()
    )


def warn_expiring_subscriptions(days: int = WARNING_DAYS) -> int:
    """Warn merchants whose paid plan lapses within ``days``.

    Returns the number of merchants warned. Renewing sets a new
    ``expires_at``, and the notice flag is cleared on renewal, so the next
    term gets its own warning.
    """
    now = timezone.now()
    cutoff = now + timedelta(days=days)

    due = (
        Subscription.objects.select_related("user")
        .filter(
            status=Subscription.Status.ACTIVE,
            expires_at__gt=now,
            expires_at__lte=cutoff,
            expiry_notice_sent_at__isnull=True,
        )
        .exclude(plan=Plan.FREE)
    )

    warned = 0
    for sub in due:
        plan_name = plan_catalogue.PLANS[
            plan_catalogue.normalise(sub.plan)
        ]["name"]
        # Round up: a plan with 30 hours left reads as "2 days", which is what
        # a merchant comparing it to the date on the next line expects.
        days_left = max(1, (sub.expires_at - now).days + 1)

        Notification.objects.create(
            recipient=sub.user,
            type=Notification.Type.PLAN_EXPIRING,
            title=f"Your {plan_name} plan expires in {days_left} day{'s' if days_left != 1 else ''}",
            body=(
                f"Renew before {sub.expires_at:%d %b %Y} to keep your "
                f"{plan_name} allowances. If it lapses your account moves to "
                f"the Free plan — nothing is deleted."
            ),
            data={
                "plan": sub.plan,
                "expires_at": sub.expires_at.isoformat(),
                "days_left": days_left,
                "url": "/dashboard/billing",
            },
        )

        _send(
            "plan_expiring.html",
            subject=f"Your Koraa {plan_name} plan expires in {days_left} day{'s' if days_left != 1 else ''}",
            user=sub.user,
            context={
                "plan_name": plan_name,
                "days_left": days_left,
                "expires_at": sub.expires_at,
                "price": plan_catalogue.price_yearly(sub.plan),
            },
            text=(
                f"Your Koraa {plan_name} plan expires on "
                f"{sub.expires_at:%d %b %Y}. Renew at {_billing_url()}."
            ),
        )

        sub.expiry_notice_sent_at = now
        sub.save(update_fields=["expiry_notice_sent_at"])
        warned += 1

    if warned:
        logger.info("Warned %s merchant(s) of an expiring plan", warned)
    return warned


def expire_lapsed_subscriptions() -> int:
    """Retire subscriptions whose term has passed and drop the tier to free.

    ``Merchant.effective_tier`` already refuses to honour a lapsed tier, so
    this changes no permissions; what it does is make the stored state say
    what is actually true, which is what the billing screen, the admin and
    the merchant's own notifications read.

    Returns the number of subscriptions expired.
    """
    now = timezone.now()

    lapsed = (
        Subscription.objects.select_related("user")
        .filter(status=Subscription.Status.ACTIVE, expires_at__lte=now)
        .exclude(plan=Plan.FREE)
    )

    expired = 0
    for sub in lapsed:
        plan_name = plan_catalogue.PLANS[
            plan_catalogue.normalise(sub.plan)
        ]["name"]

        with db_transaction.atomic():
            sub.status = Subscription.Status.EXPIRED
            sub.save(update_fields=["status"])

            # A free subscription row keeps "what plan am I on" answerable
            # from the subscription table alone, matching what buying the
            # free plan through InitiatePaymentView produces.
            Subscription.objects.create(
                user=sub.user,
                plan=Plan.FREE,
                status=Subscription.Status.ACTIVE,
                billing_cycle="yearly",
                amount_paid=0,
                starts_at=now,
                expires_at=None,
            )

            merchant = getattr(sub.user, "merchant", None)
            if merchant is not None:
                merchant.tier = Plan.FREE
                # Cleared, not kept: a null expiry is what free means
                # everywhere else, and leaving the old timestamp would have
                # the billing screen advertise a renewal date on a free plan.
                merchant.tier_expires_at = None
                merchant.save(update_fields=["tier", "tier_expires_at"])

        Notification.objects.create(
            recipient=sub.user,
            type=Notification.Type.PLAN_EXPIRED,
            title=f"Your {plan_name} plan has expired",
            body=(
                "Your account is now on the Free plan. Your storefronts stay "
                "online and nothing has been deleted — renew any time to "
                f"restore your {plan_name} allowances."
            ),
            data={
                "plan": sub.plan,
                "expired_at": sub.expires_at.isoformat() if sub.expires_at else None,
                "url": "/dashboard/billing",
            },
        )

        _send(
            "plan_expired.html",
            subject=f"Your Koraa {plan_name} plan has expired",
            user=sub.user,
            context={"plan_name": plan_name, "expires_at": sub.expires_at},
            text=(
                f"Your Koraa {plan_name} plan has expired and your account is "
                f"now on the Free plan. Reactivate at {_billing_url()}."
            ),
        )
        expired += 1

    if expired:
        logger.info("Expired %s lapsed subscription(s)", expired)
    return expired


def subscription_state(user) -> dict:
    """What the billing screen needs to know about ``user``'s plan.

    One place computes this so the API, the emails and the sweeps cannot
    disagree about whether a plan counts as expiring.
    """
    merchant: Merchant | None = getattr(user, "merchant", None)
    sub = _active_paid_subscription(user)
    lapsed = (
        Subscription.objects.filter(user=user, status=Subscription.Status.EXPIRED)
        .exclude(plan=Plan.FREE)
        .order_by("-expires_at", "-id")
        .first()
    )

    effective = merchant.effective_tier if merchant is not None else Plan.FREE
    purchased = plan_catalogue.normalise(getattr(merchant, "tier", None))
    expires_at = getattr(merchant, "tier_expires_at", None)

    now = timezone.now()
    # A lapsed tier still has a timestamp until the sweep runs, so "expired"
    # is derived from the clock rather than from having been swept.
    is_expired = bool(purchased != Plan.FREE and expires_at and expires_at <= now)
    days_remaining = (
        max(0, (expires_at - now).days + 1)
        if expires_at and expires_at > now
        else 0
    )

    return {
        "plan": effective,
        "purchased_plan": purchased,
        "status": "expired" if is_expired else "active",
        "billing_cycle": sub.billing_cycle if sub else "yearly",
        "expires_at": None if effective == Plan.FREE else expires_at,
        # Unlike expires_at, this survives the drop to free, so the billing
        # screen can say *when* the plan lapsed rather than just that it did.
        "term_ends_at": expires_at,
        "is_expired": is_expired,
        "days_remaining": days_remaining,
        "expiring_soon": bool(days_remaining and days_remaining <= WARNING_DAYS),
        "amount_paid": sub.amount_paid if sub else 0,
        "renewal_price": plan_catalogue.price_yearly(purchased),
        # The plan they were last on, kept after the sweep has cleared the
        # merchant's tier, so the billing screen can offer to reactivate the
        # plan they actually had rather than a generic upgrade.
        "previous_plan": lapsed.plan if lapsed else None,
        "previous_plan_ended_at": lapsed.expires_at if lapsed else None,
        "usage": merchant.usage() if merchant is not None else None,
    }
