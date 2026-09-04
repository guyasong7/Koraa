"""``lifecycle.subscription_state``: what the billing screen is told it owes.

The number under scrutiny here is ``renewal_price``. It quoted
``price_yearly`` unconditionally, which was correct for exactly as long as
yearly was the only cycle sold. Now that monthly is purchasable again, a
monthly subscriber reading that field would be shown ten times what renewing
their term actually costs — a merchant on Starter told 50,000 XAF instead of
5,000 XAF reads it as a price rise and churns, and nothing in the charge path
would ever have disagreed with the screen, because the screen was the only
place the wrong figure appeared.

So these tests pin the quote to the cycle the merchant is actually on, and pin
the fallback for a cycle that is neither.
"""

import pytest
from django.utils import timezone

from datetime import timedelta

from apps.merchants import plans
from apps.payments import lifecycle
from apps.payments.models import Plan, Subscription

from .factories import make_subscriber

PLAN = Plan.STARTER


def hold(user, *, cycle: str, plan: str = PLAN):
    """Give ``user`` a live paid term on ``cycle``.

    ``subscription_state`` reads the tier off the merchant and the cycle off the
    active subscription, so a fixture that set only one of the two would report a
    state no purchase can actually produce.

    The merchant is mutated through ``user.merchant`` rather than with a queryset
    ``update()``: the reverse relation is cached on the user instance, and
    ``subscription_state`` reads it through that cache, so an update written
    straight to the database leaves the object under test on the old tier.
    """
    expires_at = timezone.now() + timedelta(days=200)
    merchant = user.merchant
    merchant.tier = plan
    merchant.tier_expires_at = expires_at
    merchant.save(update_fields=["tier", "tier_expires_at"])
    return Subscription.objects.create(
        user=user,
        plan=plan,
        status=Subscription.Status.ACTIVE,
        billing_cycle=cycle,
        amount_paid=plans.price(plan, cycle),
        starts_at=timezone.now(),
        expires_at=expires_at,
    )


@pytest.mark.django_db
class TestRenewalPrice:
    def test_a_yearly_subscriber_is_quoted_the_yearly_price(self):
        user = make_subscriber()
        hold(user, cycle="yearly")

        state = lifecycle.subscription_state(user)

        assert state["billing_cycle"] == "yearly"
        assert state["renewal_price"] == plans.price_yearly(PLAN)

    def test_a_monthly_subscriber_is_quoted_the_monthly_price(self):
        """The regression this file exists for. Quoting the annual figure here
        shows a monthly merchant a tenfold rise on the screen they renew from."""
        user = make_subscriber()
        hold(user, cycle="monthly")

        state = lifecycle.subscription_state(user)

        assert state["billing_cycle"] == "monthly"
        assert state["renewal_price"] == plans.price_monthly(PLAN)

    def test_the_two_quotes_differ(self):
        """Keeps the pair above from passing vacuously."""
        assert plans.price_monthly(PLAN) != plans.price_yearly(PLAN)

    def test_an_unrecognised_cycle_is_quoted_yearly_rather_than_raising(self):
        """``billing_cycle`` has choices but no database constraint, and
        ``plans.price`` raises on an unknown cycle. The billing screen must
        still render: overstating a renewal is recoverable, a 500 is not."""
        user = make_subscriber()
        sub = hold(user, cycle="yearly")
        Subscription.objects.filter(pk=sub.pk).update(billing_cycle="fortnightly")

        state = lifecycle.subscription_state(user)

        assert state["billing_cycle"] == "yearly"
        assert state["renewal_price"] == plans.price_yearly(PLAN)

    def test_a_merchant_who_has_bought_nothing_is_quoted_nothing(self):
        """Free has no renewal, and there is no subscription to read a cycle
        from — the yearly default must not turn into a price."""
        state = lifecycle.subscription_state(make_subscriber())

        assert state["renewal_price"] == 0
        assert state["billing_cycle"] == "yearly"
