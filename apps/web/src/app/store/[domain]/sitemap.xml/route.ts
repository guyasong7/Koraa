/**
 * `/sitemap.xml` for a storefront host.
 *
 * The robots.txt the backend writes ends with a `Sitemap:` line, so this has to
 * exist or every shop advertises a 404 to the crawlers it just invited.
 *
 * It lists exactly one URL, the shop's home page, because that is all a
 * storefront currently has: products render inside the catalogue section rather
 * than on pages of their own, and `/checkout` is disallowed in robots.txt. When
 * product pages exist they belong here, keyed off the same payload.
 *
 * A locked or unresolvable shop gets an empty (but valid) sitemap rather than a
 * 404, since a crawler that has been pointed here should be told "nothing to
 * index", not "something is broken".
 */
import { getStorefrontByDomain } from "@/lib/api";

function xml(urls: Array<{ loc: string; lastmod?: string }>) {
  const body = urls
    .map(
      u =>
        `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ domain: string }> },
) {
  const { domain } = await context.params;

  const headers = {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=600, s-maxage=600",
  };

  const payload = await getStorefrontByDomain(domain);
  if (!payload || payload.locked) {
    return new Response(xml([]), { status: 200, headers });
  }

  // The request URL is the storefront's own origin — the proxy rewrote the path
  // but not the host — so links are correct on a slug subdomain and on a
  // merchant's own domain without a second setting to keep in step.
  const origin = new URL(request.url).origin;

  return new Response(
    xml([{ loc: `${origin}/`, lastmod: payload.config?.updated_at }]),
    { status: 200, headers },
  );
}
