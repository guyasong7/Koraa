/**
 * Plan copy — how a catalogue row is worded, in one place.
 *
 * `/payments/plans/` serves facts (`{stores: 3, custom_domain: true}`);
 * turning them into English is presentation, and it was written twice —
 * once on the billing screen, and once by hand on the landing page, where
 * it had already drifted into advertising 5,000 XAF/month tiers the backend
 * refused to sell at the time. Both screens read from here now, so a ceiling
 * raised in `merchants/plans.py` reaches both, and neither can name a
 * feature the enforcement code does not implement.
 *
 * That 5,000 figure is a real monthly price today — see `CYCLES` in
 * `plans.py`. It is worth knowing that the drift came first and the product
 * caught up second: the lesson was never about which cycles are on sale, it
 * was that a price written down twice disagrees with itself eventually.
 *
 * `FALLBACK_PLANS` is a static mirror of `merchants/plans.py` for use
 * when the backend is unreachable (e.g. at build time or in development).
 * Keep it in sync with `plans.py` when prices or limits change.
 */

import type { PlanCatalogueEntry } from "./api";

/**
 * Static copy of the plan catalogue, matching `merchants/plans.py`.
 *
 * Used as the pricing table's fallback when `getPlanCatalogue()` cannot
 * reach the backend. Prices and limits must match the backend exactly —
 * this is the same drift the original pricing page suffered and this
 * module exists to prevent.
 *
 * `price_monthly` is a tenth of `price_yearly`, which is where the
 * two-months-free discount lives. `apps/payments/tests/test_plans.py` asserts
 * that on the real catalogue; nothing asserts it here, so a price changed in
 * `plans.py` and not mirrored below shows the old number on a marketing page
 * whenever the backend is unreachable at build time.
 */
export const FALLBACK_PLANS: PlanCatalogueEntry[] = [
  {
    key: "free",
    name: "Free",
    tagline: "Testing the water",
    price_yearly: 0,
    price_monthly: 0,
    order: 0,
    limits: {
      stores: 1,
      products: 50,
      staff: 1,
      storefront_templates: 2,
      analytics_days: 30,
      ai_generations_per_month: 20,
    },
    features: {
      custom_domain: true,
      mobile_money_checkout: true,
      storefront_editor: true,
      invoices: true,
      priority_support: false,
      named_contact: false,
      catalogue_migration: false,
    },
  },
  {
    key: "starter",
    name: "Starter",
    tagline: "A shop that's working",
    price_yearly: 50_000,
    price_monthly: 5_000,
    order: 1,
    limits: {
      stores: 3,
      products: 500,
      staff: 3,
      storefront_templates: 4,
      analytics_days: 90,
      ai_generations_per_month: 200,
    },
    features: {
      custom_domain: true,
      mobile_money_checkout: true,
      storefront_editor: true,
      invoices: true,
      priority_support: false,
      named_contact: false,
      catalogue_migration: false,
    },
  },
  {
    key: "pro",
    name: "Pro",
    tagline: "Selling at volume",
    price_yearly: 150_000,
    price_monthly: 15_000,
    order: 2,
    limits: {
      stores: null,
      products: null,
      staff: 10,
      storefront_templates: null,
      analytics_days: 365,
      ai_generations_per_month: 2_000,
    },
    features: {
      custom_domain: true,
      mobile_money_checkout: true,
      storefront_editor: true,
      invoices: true,
      priority_support: true,
      named_contact: false,
      catalogue_migration: false,
    },
  },
  {
    key: "enterprise",
    name: "Enterprise",
    tagline: "Multiple brands or locations",
    price_yearly: 350_000,
    price_monthly: 35_000,
    order: 3,
    limits: {
      stores: null,
      products: null,
      staff: null,
      storefront_templates: null,
      analytics_days: null,
      ai_generations_per_month: null,
    },
    features: {
      custom_domain: true,
      mobile_money_checkout: true,
      storefront_editor: true,
      invoices: true,
      priority_support: true,
      named_contact: true,
      catalogue_migration: true,
    },
  },
];

/**
 * Which tier carries the "most popular" badge.
 *
 * A marketing choice rather than a catalogue fact, which is why it lives
 * here and not in `plans.py` — but it is one string, not one per screen.
 */
export const POPULAR_PLAN = "pro";

/**
 * The tier sold by conversation instead of by checkout.
 *
 * `InitiatePaymentView` will not charge for it and `dashboard/billing`
 * sends it to sales, so the pricing table has to agree: a "Buy now"
 * button here would 400 on click.
 */
export const CONTACT_SALES_PLAN = "enterprise";

/** Order matters: this is the order the bullets appear in. */
export const LIMIT_LABELS: Array<[string, (v: string) => string]> = [
  ["stores",            v => `${v} store${v === "1" ? "" : "s"}`],
  ["products",          v => `${v} products`],
  ["staff",             v => `${v} staff account${v === "1" ? "" : "s"}`],
  ["storefront_templates", v => `${v} storefront templates`],
  ["analytics_days",    v => `${v} days of analytics history`],
  ["ai_generations_per_month", v => `${v} AI generations a month`],
];

export const FEATURE_LABELS: Record<string, string> = {
  custom_domain: "Your own domain",
  mobile_money_checkout: "MTN MoMo & Orange Money checkout",
  storefront_editor: "Storefront editor with live preview",
  invoices: "Emailed invoices",
  priority_support: "Priority support",
  named_contact: "Named account manager",
  catalogue_migration: "We migrate your catalogue",
};

/** "Unlimited" for the nulls the catalogue sends in place of Infinity. */
function limitBullets(plan: PlanCatalogueEntry): string[] {
  const out: string[] = [];
  for (const [key, format] of LIMIT_LABELS) {
    const value = plan.limits[key];
    if (value === undefined) continue;
    out.push(format(value === null ? "Unlimited" : value.toLocaleString("en-GB")));
  }
  return out;
}

/** Every limit and every feature the tier includes. Used by the billing screen. */
export function planBullets(plan: PlanCatalogueEntry): string[] {
  const out = limitBullets(plan);
  for (const [key, label] of Object.entries(FEATURE_LABELS)) {
    if (plan.features[key]) out.push(label);
  }
  return out;
}

/**
 * Features every tier includes, derived rather than listed.
 *
 * Free already carries custom domains, mobile money and the editor, so
 * repeating them in all four pricing cards spends the reader's attention
 * on the things that do not vary. They belong under the table instead —
 * and deriving them by intersection means a feature that later becomes
 * paid-only drops out of this row on its own.
 */
export function universalFeatures(
  plans: PlanCatalogueEntry[],
): Array<{ key: string; label: string }> {
  if (plans.length === 0) return [];
  return Object.entries(FEATURE_LABELS)
    .filter(([key]) => plans.every((p) => p.features[key]))
    .map(([key, label]) => ({ key, label }));
}

/**
 * Bullets for one pricing card: the limits, plus only those features the
 * tier does not share with every other one.
 */
export function planCardBullets(
  plan: PlanCatalogueEntry,
  plans: PlanCatalogueEntry[],
): string[] {
  const universal = new Set(universalFeatures(plans).map((f) => f.key));
  const out = limitBullets(plan);
  for (const [key, label] of Object.entries(FEATURE_LABELS)) {
    if (plan.features[key] && !universal.has(key)) out.push(label);
  }
  return out;
}

/** Thousands-separated, with an explicit locale so server and client agree. */
export function formatXaf(amount: number): string {
  return amount.toLocaleString("en-GB");
}

/**
 * What a yearly price works out to per month.
 *
 * An equivalence, not a price — nothing charges this. Two different numbers
 * deserve the word "monthly" and conflating them is what the pricing copy got
 * wrong before:
 *
 *   * This divides by 12 — what a year works out to across the twelve months
 *     it buys. Starter: 4,167.
 *   * `price_monthly`, from the catalogue, divides by 10 — the actual monthly
 *     price, which a merchant can now buy. Starter: 5,000.
 *
 * The gap between them *is* the two-months-free discount, which is why the
 * pricing table shows both: the yearly view names this equivalence, the
 * monthly view names the real monthly price, and the difference is the
 * saving. Only one of the two is a thing to click.
 *
 * There is no `monthlyRate` counterpart here any more. It divided `price_yearly`
 * by 10 in TypeScript to reach the monthly figure, which put a pricing rule in
 * two languages; `/payments/plans/` now sends `price_monthly` outright, and
 * `merchants/plans.py` exists precisely because the same pricing fact written
 * twice drifts. Read the server's number.
 */
export function monthlyEquivalent(priceYearly: number): string {
  return formatXaf(Math.round(priceYearly / 12));
}
