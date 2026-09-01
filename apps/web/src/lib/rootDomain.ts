/**
 * The platform's root domain, and the storefront host built from it.
 *
 * Every merchant-facing surface that shows "where your shop lives" used to
 * hardcode the domain — six call sites across the dashboard, each its own
 * string. That is how they came to disagree with `middleware.ts`, which reads
 * the domain from the environment: a domain change moved the routing and left
 * the labels advertising an address that no longer resolved.
 *
 * `KORAA_PUBLIC_ROOT_DOMAIN` is the same variable the middleware matches hosts
 * against, so a label rendered here and the rewrite that serves it can never
 * drift apart again.
 *
 * `||` rather than `??` because next.config.ts resolves an unset variable to ""
 * to keep it inlined, and "" is not nullish. Same everywhere KORAA_PUBLIC_* is
 * read.
 */
export const ROOT_DOMAIN =
  process.env.KORAA_PUBLIC_ROOT_DOMAIN || "localhost:3000";

/**
 * The host a published store is reachable at — `<slug>.<root domain>`.
 *
 * Mirrors `Store.storefront_url` in backend/apps/stores/models.py. Carries the
 * port in development because `KORAA_PUBLIC_ROOT_DOMAIN` does, which is what
 * makes `shop.localhost:3000` work without a second code path.
 */
export function storefrontHost(slug: string): string {
  return `${slug}.${ROOT_DOMAIN}`;
}

/**
 * The full URL of a published store, for a link the merchant can click.
 *
 * Prefer `store.storefront_url` from the API, which knows about verified custom
 * domains; this is the fallback for a store serialised before that field
 * existed. It mirrors the same property's protocol rule — plain http only when
 * the root domain is a localhost name, because a dev certificate is not worth
 * the trouble — so the two cannot disagree about the scheme.
 *
 * The dashboard's store list hardcoded `http://<slug>.localhost:3000` here,
 * which meant every "Visit" link in production pointed at the merchant's own
 * machine and failed to connect.
 */
export function storefrontUrl(slug: string): string {
  const protocol = /(^|\.)localhost(:|$)/.test(ROOT_DOMAIN) ? "http" : "https";
  return `${protocol}://${storefrontHost(slug)}`;
}
