"use client";
/**
 * Reading the Site Settings on a storefront.
 *
 * The backend serves whatever the merchant saved, merged over the defaults —
 * but a shop published before a setting existed, or a preview payload that
 * predates the field, arrives with `settings` missing entirely. Rather than
 * making every caller guard for that, each reader here supplies the same
 * fallback the backend would have.
 *
 * Keep these defaults in step with `backend/apps/stores/site_settings.py`. They
 * are duplicated rather than fetched because a storefront must render on the
 * first paint, and a second round trip to learn that images should lazy-load
 * defeats the setting.
 */
import { useStorefront } from "../StorefrontProvider";
import type { SiteSettings, Store } from "../../types/storefront";

const FALLBACK: SiteSettings = {
  availability: "public",
  cookie_banner: "off",
  pinterest_save: "off",
  image_optimization: "auto",
  image_quality: 80,
  image_lazy_load: true,
  image_fit: "cover",
  image_zoom: true,
  default_language: "en",
};

export function useSiteSettings(): SiteSettings {
  const { settings } = useStorefront();
  if (!settings) return FALLBACK;
  return { ...FALLBACK, ...settings };
}

/**
 * The image attributes that belong on the element rather than in CSS.
 *
 * `image_fit` is deliberately absent: it is published as the `--sf-img-fit`
 * custom property by the renderer root, so the cascade applies it and a layout
 * can override it. An inline `object-fit` could not be overridden at all.
 *
 * Compression is not honoured anywhere. The storefront serves merchant uploads
 * straight from storage rather than through an image pipeline, so there is
 * nothing for `image_quality` to reach yet; the dashboard panel says so rather
 * than implying otherwise.
 */
export function useImageAttrs(): {
  loading: "lazy" | "eager";
  decoding: "async" | "auto";
  zoom: boolean;
} {
  const s = useSiteSettings();
  const lazy = s.image_lazy_load !== false;
  return {
    loading: lazy ? "lazy" : "eager",
    decoding: lazy ? "async" : "auto",
    zoom: s.image_zoom !== false,
  };
}

/**
 * The Pinterest "Save" URL for one product image.
 *
 * Built by hand rather than by loading Pinterest's `pinit.js`: that script
 * rewrites the DOM around every image it finds, which fights the layouts, and
 * it is a third-party tag on a shop whose Cookies panel may be set to ask
 * before anything like that loads.
 */
export function pinterestSaveUrl(
  store: Store,
  product: { name: string; image: string | null },
  pageUrl: string,
): string | null {
  if (!product.image) return null;
  const params = new URLSearchParams({
    url: pageUrl,
    media: product.image,
    description: `${product.name} — ${store.name}`,
  });
  return `https://www.pinterest.com/pin/create/button/?${params.toString()}`;
}
