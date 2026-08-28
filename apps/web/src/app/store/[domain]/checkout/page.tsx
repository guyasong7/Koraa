import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CheckoutClient from "./CheckoutClient";

/**
 * Never indexed.
 *
 * A checkout URL in a search result is a dead end at best — it renders whatever
 * is in *that* visitor's cart, so a crawled copy shows an empty one — and it
 * competes with the shop's own pages for the shop's own name. `nocache` keeps it
 * out of cached snapshots too, which would otherwise hold a stranger's order
 * summary.
 */
export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false, nocache: true },
};

export default async function CheckoutPage(props: {
  params: Promise<{ domain: string }>;
}) {
  const params = await props.params;
  const { domain } = params;

  if (!domain) {
    notFound();
  }

  return <CheckoutClient domain={domain} />;
}
