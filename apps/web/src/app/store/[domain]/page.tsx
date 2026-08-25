import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getStorefrontByDomain } from "@/lib/api";
import { StorefrontProvider } from "@/components/StorefrontProvider";
import { StorefrontRenderer } from "@/components/StorefrontRenderer";
import { StoreGate } from "@/components/storefront/StoreGate";
import type { GatePayload } from "@/components/storefront/StoreGate";
import type { StorefrontData } from "@/types/storefront";

type Payload = (StorefrontData & { locked?: undefined }) | GatePayload;

/** A locked shop returns 200 with `locked` set, rather than a 404. */
function isLocked(payload: Payload): payload is GatePayload {
  return typeof (payload as GatePayload).locked === "string";
}

/**
 * The tags the Social Sharing and Favicon panels control.
 *
 * Built here rather than in the renderer because Open Graph tags have to be in
 * the document `<head>` when a crawler reads it, and a chat app pasting a link
 * does not run the page's JavaScript. Falls back through the merchant's SEO
 * fields to the shop's own name, so a shop that filled in nothing still gets a
 * card with its name on it rather than "Koraa".
 */
export async function generateMetadata(props: {
  params: Promise<{ domain: string }>;
}): Promise<Metadata> {
  const { domain } = await props.params;
  const payload: Payload | null = await getStorefrontByDomain(domain);

  if (!payload) return { title: "Shop not found" };

  if (isLocked(payload)) {
    return {
      title: payload.store.name,
      // A locked shop must not be indexed: the gate page is all a crawler can
      // reach, and a search result leading to a passcode prompt is worse than
      // no result.
      robots: { index: false, follow: false },
      icons: payload.store.favicon ? { icon: payload.store.favicon } : undefined,
    };
  }

  const { store, settings } = payload;
  const title = settings?.social_title || store.seo_title || store.name;
  const description =
    settings?.social_description ||
    store.seo_description ||
    store.tagline ||
    store.description ||
    `Shop ${store.name} online.`;
  const image = store.social_image || store.logo || undefined;
  const card = settings?.twitter_card === "summary" ? "summary" : "summary_large_image";
  const languages = settings?.languages ?? [];

  return {
    title,
    description,
    icons: store.favicon ? { icon: store.favicon } : undefined,
    openGraph: {
      title,
      description,
      siteName: store.name,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card,
      title,
      description,
      images: image ? [image] : undefined,
    },
    // From the Pinterest panel. A meta tag is the only way Pinterest will
    // confirm a domain it does not host.
    other: settings?.pinterest_verify
      ? { "p:domain_verify": String(settings.pinterest_verify) }
      : undefined,
    // Declared, not translated. Telling a crawler the shop is also written in
    // French is only honest if the merchant wrote it — see the panel's note.
    alternates:
      languages.length > 1
        ? { languages: Object.fromEntries(languages.map(code => [code, "/"])) }
        : undefined,
  };
}

export default async function StorefrontPage(props: {
  params: Promise<{ domain: string }>;
}) {
  const params = await props.params;
  const { domain } = params;
  const storefront: Payload | null = await getStorefrontByDomain(domain);

  if (!storefront) {
    notFound();
  }

  // Private or passcode-protected. The API decides this — enforcing it here as
  // well would only add a second place to get it wrong — and returns a 200 so
  // that a protected shop is not confused with one that does not exist.
  if (isLocked(storefront)) {
    return <StoreGate payload={storefront} />;
  }

  return (
    <StorefrontProvider initialData={storefront} isPreview={false}>
      <StorefrontRenderer />
    </StorefrontProvider>
  );
}
