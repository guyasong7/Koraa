"""
Plan catalogue — the single source of truth for what each tier costs and
what it unlocks.

Before this module the same facts were written down in four places:

  * ``Merchant.can_create_store`` / ``can_add_product``  (limits)
  * ``payments.views.PLAN_PRICES``                        (prices)
  * ``apps/web/src/app/(landing)/page.tsx``               (marketing copy)
  * ``apps/web/src/app/dashboard/billing/page.tsx``       (upgrade screen)

They disagreed. The landing page promised custom domains on every plan
while the dashboard sold them as a Starter feature; the pricing table
advertised limits the enforcement code didn't implement. Everything now
derives from ``PLANS`` below, and ``/api/payments/plans/`` serves it to
the frontend so the marketing copy cannot drift from the enforcement.

Billing is annual only. Koraa used to offer monthly and yearly at a
straight 12x, which gave buyers no reason to commit and gave Koraa no
working capital. Annual pricing here is the old monthly rate x10 — two
months free — so the buyer saves and Koraa collects a year upfront.
Historic monthly subscriptions still read correctly; see
``payments.views.BILLING_CYCLES``.
"""

from __future__ import annotations

#: Sentinel for "no ceiling". Comparisons use ``<`` against a real int, so
#: a float infinity is simpler and safer than sprinkling ``None`` checks.
UNLIMITED = float("inf")


PLANS: dict[str, dict] = {
    "free": {
        "name": "Free",
        "tagline": "Testing the water",
        "price_yearly": 0,
        "order": 0,
        "limits": {
            # Kept at 50, not lowered, because live free merchants are
            # already sitting against this ceiling. Tightening it would
            # retroactively put existing catalogues over quota.
            "stores": 1,
            "products": 50,
            "staff": 1,
            "storefront_templates": 2,
            "analytics_days": 30,
            "ai_generations_per_month": 20,
        },
        "features": {
            "custom_domain": True,
            "mobile_money_checkout": True,
            "storefront_editor": True,
            "invoices": True,
            "priority_support": False,
            "named_contact": False,
            "catalogue_migration": False,
        },
    },
    "starter": {
        "name": "Starter",
        "tagline": "A shop that's working",
        "price_yearly": 50_000,
        "order": 1,
        "limits": {
            "stores": 3,
            # 200 -> 500. Starter is the tier people outgrow fastest and
            # the product ceiling was the usual reason; the cost of
            # storing rows is not what Koraa is selling.
            "products": 500,
            "staff": 3,
            "storefront_templates": 4,
            "analytics_days": 90,
            "ai_generations_per_month": 200,
        },
        "features": {
            "custom_domain": True,
            "mobile_money_checkout": True,
            "storefront_editor": True,
            "invoices": True,
            "priority_support": False,
            "named_contact": False,
            "catalogue_migration": False,
        },
    },
    "pro": {
        "name": "Pro",
        "tagline": "Selling at volume",
        "price_yearly": 150_000,
        "order": 2,
        "limits": {
            "stores": UNLIMITED,
            "products": UNLIMITED,
            "staff": 10,
            "storefront_templates": UNLIMITED,
            "analytics_days": 365,
            "ai_generations_per_month": 2_000,
        },
        "features": {
            "custom_domain": True,
            "mobile_money_checkout": True,
            "storefront_editor": True,
            "invoices": True,
            "priority_support": True,
            "named_contact": False,
            "catalogue_migration": False,
        },
    },
    "enterprise": {
        "name": "Enterprise",
        "tagline": "Multiple brands or locations",
        "price_yearly": 350_000,
        "order": 3,
        "limits": {
            "stores": UNLIMITED,
            "products": UNLIMITED,
            "staff": UNLIMITED,
            "storefront_templates": UNLIMITED,
            "analytics_days": UNLIMITED,
            "ai_generations_per_month": UNLIMITED,
        },
        "features": {
            "custom_domain": True,
            "mobile_money_checkout": True,
            "storefront_editor": True,
            "invoices": True,
            "priority_support": True,
            "named_contact": True,
            "catalogue_migration": True,
        },
    },
}

#: Order tiers cheapest-first. Used to answer "is X at least Y".
TIER_ORDER = [key for key, _ in sorted(PLANS.items(), key=lambda kv: kv[1]["order"])]

#: Paid tiers only — what ``InitiatePaymentView`` will actually charge for.
PAID_TIERS = [k for k in TIER_ORDER if PLANS[k]["price_yearly"] > 0]


def normalise(tier: str | None) -> str:
    """Coerce anything into a tier key we know, defaulting to free.

    Guards every lookup below: an unknown or NULL tier column must not
    raise, and must not accidentally grant more than free.
    """
    if tier and tier in PLANS:
        return tier
    return "free"


def limit(tier: str | None, key: str) -> int | float:
    """Return a numeric ceiling for ``key``, or ``UNLIMITED``.

    Unknown keys return 0 rather than ``UNLIMITED`` — a typo should fail
    closed and be obvious, not silently hand out an unlimited allowance.
    """
    return PLANS[normalise(tier)]["limits"].get(key, 0)


def has_feature(tier: str | None, key: str) -> bool:
    """Whether ``tier`` includes the named boolean feature."""
    return bool(PLANS[normalise(tier)]["features"].get(key, False))


def at_least(tier: str | None, minimum: str) -> bool:
    """True when ``tier`` is ``minimum`` or better in the ladder."""
    return TIER_ORDER.index(normalise(tier)) >= TIER_ORDER.index(normalise(minimum))


def price_yearly(tier: str | None) -> int:
    """Annual price in XAF. Free is 0."""
    return PLANS[normalise(tier)]["price_yearly"]


def public_catalogue() -> list[dict]:
    """JSON-safe plan list for the pricing page and billing screen.

    ``UNLIMITED`` is a float infinity, which ``json.dumps`` renders as the
    bare token ``Infinity`` — valid JavaScript but invalid JSON, and
    ``JSON.parse`` rejects it. It is serialised as ``None`` here so the
    frontend can test for null and print "Unlimited".
    """

    def clean(value):
        return None if value == UNLIMITED else value

    return [
        {
            "key": key,
            "name": plan["name"],
            "tagline": plan["tagline"],
            "price_yearly": plan["price_yearly"],
            "order": plan["order"],
            "limits": {k: clean(v) for k, v in plan["limits"].items()},
            "features": dict(plan["features"]),
        }
        for key, plan in sorted(PLANS.items(), key=lambda kv: kv[1]["order"])
    ]
