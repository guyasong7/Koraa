/**
 * `/robots.txt` for a storefront host.
 *
 * The rules come from the backend — the Crawlers panel writes them, and a shop
 * that is unpublished or not public is disallowed outright there regardless of
 * what the panel says. This route only has to find out which shop the host is
 * and hand the answer through.
 *
 * The host may be a slug on the platform domain or a merchant's own domain, and
 * only the backend can tell those apart, so the shop is resolved by domain
 * first and the robots file fetched by the slug that comes back. That lookup is
 * cached for a minute, and the robots file for five.
 *
 * A shop that cannot be resolved gets a blanket Disallow rather than an empty
 * body: an empty robots.txt means "crawl everything", which is the wrong answer
 * to "we could not work out whose shop this is".
 */
import { getStorefrontByDomain, getStorefrontRobots } from "@/lib/api";

const DISALLOW_ALL = "User-agent: *\nDisallow: /\n";

export async function GET(
  _request: Request,
  context: { params: Promise<{ domain: string }> },
) {
  const { domain } = await context.params;

  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=300, s-maxage=300",
  };

  const payload = await getStorefrontByDomain(domain);
  const slug: string | undefined = payload?.store?.slug;
  if (!slug) return new Response(DISALLOW_ALL, { status: 200, headers });

  const body = await getStorefrontRobots(slug);
  return new Response(body ?? DISALLOW_ALL, { status: 200, headers });
}
