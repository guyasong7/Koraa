"""The pricing ladder itself: the invariants the plan table has to hold.

``apps.merchants.plans`` is the catalogue, so these could as easily live under
``apps/merchants/tests``. They are here because what they protect is a billing
fact rather than a merchant one — ``payments.views`` turns these figures into a
charge and ``payments.settlement`` turns the cycle into a term — and because
``plans.py`` names this package as the place the ÷10 ladder is pinned down.

Nothing here touches the database. The catalogue is a module-level dict, and a
test that needed a migration to check arithmetic would be the wrong shape.
"""

import pytest

from apps.merchants import plans


def test_every_tier_prices_a_year_at_ten_months():
    """The two-months-free claim, which is the entire shape of the discount.

    It is deliberately not enforced in the code: both figures are written down
    in ``PLANS`` by hand so a tier can be repriced without either cycle
    inheriting a rounding artefact from the other. That freedom is exactly why
    it needs a test — the annual figure, the pricing table and the marketing
    copy stop agreeing the moment it drifts, and nothing else would notice.
    """
    for tier in plans.PLANS:
        monthly, yearly = plans.price_monthly(tier), plans.price_yearly(tier)
        assert monthly * 10 == yearly, (
            f"{tier}: {monthly} XAF a month does not make {yearly} XAF a year "
            f"at ten months — the two-months-free discount no longer reads"
        )


def test_every_tier_is_priced_on_both_cycles():
    """A tier with a cycle missing raises ``KeyError`` from ``price``, and the
    call site for that is inside the charge path rather than at import."""
    for tier in plans.PLANS:
        for cycle in plans.CYCLES:
            assert isinstance(plans.price(tier, cycle), int)


def test_the_free_tier_costs_nothing_on_either_cycle():
    for cycle in plans.CYCLES:
        assert plans.price("free", cycle) == 0


def test_price_refuses_a_cycle_it_has_no_figure_for():
    """Callers validate against ``CYCLES`` before reaching ``price``, so an
    unknown cycle here is a programming error. It must raise rather than fall
    back to the annual amount, which would charge a year for a shorter term."""
    with pytest.raises(KeyError):
        plans.price("starter", "weekly")


def test_the_public_catalogue_carries_both_cycles():
    """The pricing page and the billing screen both render from this payload.
    A missing key there is a blank price on a marketing page, not an error."""
    catalogue = plans.public_catalogue()

    assert catalogue, "the catalogue is empty"
    for entry in catalogue:
        assert isinstance(entry["price_monthly"], int), entry["key"]
        assert isinstance(entry["price_yearly"], int), entry["key"]
