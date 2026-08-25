"use client";
/**
 * Sending storefront events — and the rules about when not to.
 *
 * Three things this deliberately does not do:
 *
 * **It never throws.** A shop must not break because a measurement request
 * failed. Every path here swallows its own errors; the worst outcome of a
 * problem in this file is a missing row in a report.
 *
 * **It never runs in the editor preview.** A merchant restyling their hero
 * would otherwise spend the afternoon becoming their own best customer.
 *
 * **It asks before measuring, where the merchant has chosen to ask.** A
 * `consent` cookie banner is a real question, so nothing is sent until the
 * visitor has said yes. A `notice` banner, or none, is not a question — and
 * this tracker stores no identifier for it to be a question about; see
 * `backend/apps/analytics/models.py`.
 *
 * The wire format is one small JSON POST per event, sent with `keepalive` so a
 * visitor who clicks away mid-request is still counted. The endpoint answers
 * `204` to everything, valid or not, so there is nothing here to handle.
 */
import { useCallback, useEffect, useRef } from "react";

import { useStorefront } from "@/components/StorefrontProvider";
import { CONSENT_EVENT, cookieChoice } from "@/components/storefront/CookieBanner";
import { useSiteSettings } from "@/components/storefront/siteSettings";

import { API_BASE_URL } from "./apiUrl";

/** Kept in step with `Event.Kind` in `backend/apps/analytics/models.py`. */
export type AnalyticsKind =
  | "page_view"
  | "product_view"
  | "add_to_cart"
  | "checkout_start"
  | "search";

export interface TrackExtra {
  /** Defaults to the current path. Pass one for a page whose URL is not it. */
  path?: string;
  referrer?: string;
  /** A product id, for the events that are about one. */
  product?: string;
  /** A search term. Free text, and the backend caps its length. */
  label?: string;
}

const ENDPOINT = `${API_BASE_URL}/public/analytics/collect/`;

/**
 * Whether the visitor has agreed, for the banner mode this shop is running.
 *
 * `banner` is `SiteSettings.cookie_banner`. An unrecognised value is treated as
 * the strictest reading, so a future mode cannot accidentally start collecting.
 */
function permitted(slug: string, banner: string, isPreview: boolean): boolean {
  if (isPreview) return false;
  if (typeof window === "undefined") return false;
  if (banner === "off" || banner === "notice") return true;
  return cookieChoice(slug) === "accepted";
}

/**
 * Send one event. Returns whether it was sent, which is not the same as whether
 * it was recorded — a `keepalive` POST is fire-and-forget by design.
 *
 * Exported for the pages that live outside `StorefrontProvider` (checkout is
 * one) and therefore cannot use the hook.
 */
export function trackEvent(args: {
  slug: string;
  kind: AnalyticsKind;
  /** `SiteSettings.cookie_banner` for this shop: "off" | "notice" | "consent". */
  banner?: string;
  isPreview?: boolean;
} & TrackExtra): boolean {
  const { slug, kind, banner = "off", isPreview = false } = args;
  if (!slug) return false;
  if (!permitted(slug, banner, isPreview)) return false;

  try {
    const body = JSON.stringify({
      store: slug,
      kind,
      path: args.path ?? window.location.pathname,
      // The backend reduces this to a hostname and drops the shop's own, so
      // sending the whole thing here costs nothing and keeps the trimming rules
      // in one place.
      referrer: args.referrer ?? document.referrer ?? "",
      product: args.product ?? "",
      label: args.label ?? "",
    });

    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // Survives the page being closed or navigated away from, which is exactly
      // the case a page view on the last page of a visit falls into.
      keepalive: true,
      // No token, and nothing to send one from: the endpoint is anonymous, and
      // omitting credentials keeps it out of the CORS-with-credentials rules.
      credentials: "omit",
    }).catch(() => {
      /* measurement is not worth an error in a shopper's console */
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * A tracker bound to the storefront being rendered.
 *
 * Every call site gets the shop, the consent mode and the preview flag from
 * here rather than passing them along, so there is one place where the decision
 * to send is made.
 */
export function useStorefrontTracker(): (kind: AnalyticsKind, extra?: TrackExtra) => boolean {
  const { store, isPreview } = useStorefront();
  const settings = useSiteSettings();
  const banner = String(settings.cookie_banner ?? "off");
  const slug = store?.slug ?? "";

  return useCallback(
    (kind, extra = {}) => trackEvent({ slug, kind, banner, isPreview, ...extra }),
    [slug, banner, isPreview],
  );
}

/**
 * One page view per path, for as long as this component is mounted.
 *
 * The re-fire on consent matters more than it looks: on a shop running a
 * `consent` banner, a first-time visitor's opening page view is suppressed a
 * moment before they click Accept. Without this, the shops that ask permission
 * would be the shops whose traffic looks like nothing.
 */
export function usePageView(path?: string): void {
  const track = useStorefrontTracker();
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const key = path ?? window.location.pathname;

    const fire = () => {
      if (sent.current === key) return;
      // Marked only on a real send, so a view refused for want of consent is
      // still available to the listener below.
      if (track("page_view", { path: key })) sent.current = key;
    };

    fire();
    window.addEventListener(CONSENT_EVENT, fire);
    return () => window.removeEventListener(CONSENT_EVENT, fire);
  }, [path, track]);
}
