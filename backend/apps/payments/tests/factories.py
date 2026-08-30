"""Scaffolding for the plan-payment tests.

A plan purchase needs a User with a Merchant profile (activation writes
``merchant.tier``), a PENDING Subscription and an unsettled PaymentTransaction —
four rows before a test can say anything. They live here so ``test_initiate`` and
``test_reconcile`` cannot drift into two different ideas of what a stuck payment
looks like.

``test_webhooks`` predates this module and keeps its own local helpers; it is
testing a different endpoint and was left alone rather than churned.
"""

import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.merchants.models import Merchant
from apps.payments.models import PaymentTransaction, Plan, Subscription

User = get_user_model()

PASSWORD = "Koraa@2024!"

#: A number Fapshi's sandbox documents as always succeeding, and an MTN prefix,
#: so ``infer_medium`` resolves it without a caller-supplied ``medium``.
PHONE = "670000001"


def make_subscriber(*, tier=Plan.FREE, tier_expires_at=None):
    """A merchant who can buy a plan. Free by default, i.e. has bought nothing."""
    suffix = uuid.uuid4().hex[:8]
    user = User.objects.create_user(
        email=f"buyer-{suffix}@koraa.test", full_name="Plan Buyer", password=PASSWORD
    )
    Merchant.objects.create(
        user=user,
        business_name="Sub Shop",
        country="CM",
        tier=tier,
        tier_expires_at=tier_expires_at,
    )
    return user


def make_pending_transaction(
    *, user=None, trans_id=None, plan=Plan.STARTER, amount=50000
):
    """A charge Fapshi accepted and nobody has settled yet.

    This is the shape every recovery path operates on: subscription PENDING,
    ``settled_at`` null, a ``transId`` to ask Fapshi about.
    """
    user = user or make_subscriber()
    trans_id = trans_id or f"tx-{uuid.uuid4().hex[:10]}"
    sub = Subscription.objects.create(
        user=user,
        plan=plan,
        status=Subscription.Status.PENDING,
        billing_cycle="yearly",
        amount_paid=amount,
        fapshi_trans_id=trans_id,
    )
    return PaymentTransaction.objects.create(
        subscription=sub,
        user=user,
        fapshi_trans_id=trans_id,
        amount=amount,
        plan=plan,
        billing_cycle="yearly",
        fapshi_status="REQUESTED",
    )


def make_unfollowable_subscription(*, user=None, plan=Plan.STARTER):
    """What the ``FapshiUnavailable`` branch of ``InitiatePaymentView`` leaves.

    PENDING, no ``transId``, and possibly a real debit behind it. Nothing can
    settle it automatically — the sweep can only count it.
    """
    return Subscription.objects.create(
        user=user or make_subscriber(),
        plan=plan,
        status=Subscription.Status.PENDING,
        billing_cycle="yearly",
        amount_paid=50000,
    )


def age(obj, *, minutes: int):
    """Backdate ``created_at`` past a reconcile cutoff.

    ``auto_now_add`` cannot be assigned through ``save()``, so this goes through
    ``update()`` — which also avoids touching ``updated_at``. Applied to the
    transaction *and* its subscription, because the two halves of the sweep
    select on different rows and a test aging only one would pass for the wrong
    reason.
    """
    when = timezone.now() - timedelta(minutes=minutes)
    type(obj).objects.filter(pk=obj.pk).update(created_at=when)
    sub = getattr(obj, "subscription", None)
    if sub is not None:
        Subscription.objects.filter(pk=sub.pk).update(created_at=when)
    obj.refresh_from_db()
    return obj
