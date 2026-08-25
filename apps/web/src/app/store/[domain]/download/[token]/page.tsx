import type { Metadata } from "next";
import { notFound } from "next/navigation";

import DownloadClient from "./DownloadClient";

/**
 * A purchase is nobody's business but the buyer's, so this is never indexed.
 *
 * The title stays generic for the same reason: the tab, the browser history and
 * a shared screenshot would otherwise name what someone bought.
 */
export const metadata: Metadata = {
  title: "Your download",
  robots: { index: false, follow: false },
};

/**
 * `/download/<token>` on a storefront host, rewritten here by `proxy.ts`.
 *
 * `Store.storefront_url` builds the link this way in `orders/downloads.py`, so
 * the address in the buyer's email lands on this route.
 *
 * The `domain` in the path is not read: the token identifies the grant on its
 * own, and the manifest carries the shop it belongs to. Trusting the host here
 * as well would only make two things able to disagree.
 */
export default async function DownloadPage(props: {
  params: Promise<{ domain: string; token: string }>;
}) {
  const { token } = await props.params;

  if (!token) notFound();

  return <DownloadClient token={token} />;
}
