/**
 * What a storefront looks like before the merchant has chosen anything.
 *
 * These are only fallbacks — a merchant who picks colours in the storefront
 * settings overrides every one of them. But the fallback is what a shop wears
 * on the day it is published, which is most shops for their first week, so it
 * is Koraa's colour rather than a placeholder. It used to be a violet
 * (#a855f7 / #7c3aed) inherited from an older build, which meant a new
 * merchant's shop looked like a different company's product than the dashboard
 * they had just published it from.
 *
 * The values are the brand ramp's --brand-600 and --brand-700, written as
 * literal hex rather than as `var(--brand-solid)`. That is deliberate: a
 * storefront is the merchant's own site on the merchant's own background
 * (--sf-bg, white by default) and must not follow Koraa's light/dark theme.
 * A token here would repaint every unstyled shop the moment a visitor's OS
 * switched to dark mode.
 *
 * White on #a8530f is 5.3:1 and on #8a4310 is 7.3:1, so a primary-filled
 * button with white text clears AA at both ends of the pair.
 *
 * Three call sites read these — the renderer, the checkout and the store
 * gate — which is why they live here instead of being repeated as literals
 * in each: the previous copies had already drifted into two spellings of the
 * same intent.
 */
export const STOREFRONT_DEFAULTS = {
  /** Fills and links. */
  primary: "#a8530f",
  /** The darker end of gradients, and hovers. */
  accent: "#8a4310",
  background: "#ffffff",
  text: "#0f1117",
  secondary: "#f8f8f8",
  font: "Inter",
} as const;
