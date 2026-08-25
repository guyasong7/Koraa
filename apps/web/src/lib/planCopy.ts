/**
 * Plan copy — how a catalogue row is worded, in one place.
 *
 * `/payments/plans/` serves facts (`{stores: 3, custom_domain: true}`);
 * turning them into English is presentation, and it was written twice —
 * once on the billing screen, and once by hand on the landing page, where
 * it had already drifted into advertising 5,000 XAF/month tiers the
 * backend refuses to sell. Both screens read from here now, so a ceiling
 * raised in `merchants/plans.py` reaches both, and neither can name a
 * feature the enforcement code does not implement.
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
 */
export const FALLBACK_PLANS: PlanCatalogueEntry[] = [
  {
    key: "free",
    name: "Free",
    tagline: "Testing the water",
    price_yearly: 0,
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
 * Billing is annual only — `PURCHASABLE_CYCLES` rejects anything else —
 * so this is shown as an equivalence, never as something to buy.
 */
export function monthlyEquivalent(priceYearly: number): string {
  return formatXaf(Math.round(priceYearly / 12));
}

/**
 * The per-month list rate the annual price is built from.
 *
 * Two different numbers deserve the word "monthly" here, and conflating
 * them is what the pricing copy got wrong before:
 *
 *   * `monthlyEquivalent` divides by 12 — what a year actually costs you,
 *     spread over the twelve months you get. Starter: 4,167.
 *   * `monthlyRate` divides by 10 — the rate the annual price was set
 *     from. `merchants/plans.py`: "Annual pricing here is the old monthly
 *     rate x10 — two months free". Starter: 5,000.
 *
 * The gap between them *is* the discount, which is why the pricing table
 * shows both: the monthly view names this rate, the yearly view names the
 * equivalent, and the difference is the two free months.
 *
 * Nothing here is purchasable monthly. `PURCHASABLE_CYCLES` rejects
 * `billing_cycle=monthly` with a 400, and the landing page once drifted
 * into advertising exactly this number as a buyable tier (see this
 * module's header). Any surface showing it must also say that the charge
 * is annual — that disclosure is the thing keeping this honest, not
 * decoration on top of it.
 */
export function monthlyRate(priceYearly: number): string {
  return formatXaf(Math.round(priceYearly / 10));
}
