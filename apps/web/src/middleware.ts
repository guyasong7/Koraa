import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Host-based storefront routing.
 *
 * A published store's URL is `<slug>.<root domain>` (see `Store.storefront_url`
 * in `backend/apps/stores/models.py`), but the storefront itself is rendered by
 * the `/store/[domain]` route. Without this rewrite every storefront link 404s
 * in development: nginx performs the same mapping in production, so nothing
 * local was doing it.
 *
 * The backend already resolves either form — `PublicStorefrontByDomainView`
 * looks up an explicit `StoreDomain` first and otherwise takes the first label
 * of the host as the slug, stripping the port so `shop.localhost:3000` works.
 * So all this has to do is hand it the host.
 *
 * `KORAA_PUBLIC_ROOT_DOMAIN` carries the port in development (`localhost:3000`)
 * because the Host header does too; comparing both with the port keeps the
 * suffix test exact. Point it at the real domain to deploy — nothing here is
 * hardcoded to localhost.
 */

// Read here rather than imported from lib/rootDomain, which holds the same
// value for the dashboard's own labels. Next 16's proxy docs are explicit that
// this file "is meant to be invoked separately of your render code and in
// optimized cases deployed to your CDN", so it "should not attempt relying on
// shared modules or globals" — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
// Both copies resolve the same inlined variable, so they cannot disagree.
const ROOT_DOMAIN = process.env.KORAA_PUBLIC_ROOT_DOMAIN || "localhost:3000";

/**
 * Subdomains that belong to the platform, not to a merchant. Without this,
 * `www.koraa.cm` would be looked up as a store called "www".
 */
const RESERVED = new Set([
  "www", "api", "app", "admin", "dashboard", "auth",
  "static", "cdn", "assets", "mail", "smtp", "ftp", "preview",
]);

/** True for hosts that can never be a merchant's custom domain. */
function isPlatformHost(host: string): boolean {
  const name = host.split(":")[0];
  return (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name.endsWith(".vercel.app") || // Prevent Vercel URLs from being treated as store domains
    name === "127.0.0.1" ||
    name === "0.0.0.0" ||
    name === "[::1]" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(name)
  );
}

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const { pathname, search } = request.nextUrl;

  // Already an internal storefront path, or no Host to work with.
  if (!host || pathname.startsWith("/store/")) return NextResponse.next();

  let storeHost: string | null = null;

  if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) {
    // The platform itself — landing page, dashboard, auth.
    return NextResponse.next();
  }

  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    const label = host.slice(0, -(ROOT_DOMAIN.length + 1));
    // Only a single leading label is a slug; deeper names are not ours.
    if (label.includes(".") || RESERVED.has(label)) return NextResponse.next();
    storeHost = label;
  } else if (!isPlatformHost(host)) {
    // A merchant's own domain. Pass the whole host so the backend can match it
    // against a verified StoreDomain rather than guessing a slug from it.
    storeHost = host;
  }

  if (!storeHost) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/store/${storeHost}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip API routes, Next internals, and anything with a file extension, so
  // assets are never rewritten onto a storefront path.
  //
  // robots.txt and sitemap.xml are named explicitly because they *do* have
  // extensions but are per-shop: each storefront host serves its own, built
  // from that shop's Crawlers settings. Without these two entries the extension
  // rule above swallows them and a crawler on `shop.koraa.cm/robots.txt`
  // gets the platform's, or a 404.
  matcher: [
    "/((?!api|_next/static|_next/image|.*\\..*).*)",
    "/robots.txt",
    "/sitemap.xml",
  ],
};
