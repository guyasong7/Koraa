"use client";
/**
 * The cookie banner, from the Cookies and Data Privacy panel.
 *
 * Three modes, and the difference between two of them is the point:
 *
 * - **notice** tells the visitor and gets out of the way. One dismiss button.
 * - **consent** asks, and offers a real refusal. A banner whose only button is
 *   "Accept" is not consent, so Decline is given equal weight rather than being
 *   a grey link in the corner.
 *
 * The choice is kept in `localStorage`, per shop, so a visitor who has answered
 * is not asked again — and deliberately not in a cookie, since a consent banner
 * that sets a cookie before you answer it is the thing it is supposed to
 * prevent.
 *
 * What consent gates today is analytics. Nothing else on a Koraa storefront
 * loads a third-party tag, and the cart is first-party state a shop cannot
 * function without.
 */
import { useEffect, useState } from "react";
import { LuCookie, LuX } from "react-icons/lu";

import { useStorefront } from "../StorefrontProvider";
import { useSiteSettings } from "./siteSettings";

const DEFAULT_TEXT =
  "This site uses cookies to keep your cart and to understand how the shop is used.";

/**
 * Fired on the window when a visitor accepts.
 *
 * The banner's own state is local, so nothing else would hear the answer. The
 * tracker listens for this to send the page view it suppressed a moment
 * earlier — without it, a shop that asks permission is a shop whose opening
 * page views are all lost.
 */
export const CONSENT_EVENT = "koraa:consent";

/** Whether the visitor has agreed to analytics on this shop. */
export function cookieChoice(slug: string): "accepted" | "declined" | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(`koraa.cookies.${slug}`);
    return value === "accepted" || value === "declined" ? value : null;
  } catch {
    // Private browsing with storage blocked. Treated as "not answered", which
    // means asked again next visit rather than assumed to have agreed.
    return null;
  }
}

export function CookieBanner() {
  const { store, config, isPreview } = useStorefront();
  const settings = useSiteSettings();
  const [answered, setAnswered] = useState(true);

  const mode = settings.cookie_banner ?? "off";

  useEffect(() => {
    // Read after mount: `localStorage` does not exist on the server, and
    // rendering the banner during SSR then hiding it would flash it at every
    // returning visitor.
    if (mode === "off") return;
    setAnswered(cookieChoice(store.slug) !== null);
  }, [mode, store.slug]);

  if (mode === "off" || answered) return null;

  const remember = (choice: "accepted" | "declined") => {
    try {
      // Not in the editor preview: the merchant checking their own banner
      // should see it again next time they look.
      if (!isPreview) window.localStorage.setItem(`koraa.cookies.${store.slug}`, choice);
    } catch {
      /* storage blocked — the banner simply reappears */
    }
    setAnswered(true);
    if (choice === "accepted" && !isPreview) {
      window.dispatchEvent(new Event(CONSENT_EVENT));
    }
  };

  const links: Array<{ label: string; href: string }> = [];
  if (settings.cookie_policy_url) {
    links.push({ label: "Cookie policy", href: String(settings.cookie_policy_url) });
  }
  if (settings.privacy_policy_url) {
    links.push({ label: "Privacy policy", href: String(settings.privacy_policy_url) });
  }

  return (
    <div
      role="dialog"
      aria-label="Cookies"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 900,
        maxWidth: 560,
        margin: "0 auto",
        background: "var(--sf-bg, #fff)",
        color: "var(--sf-text, #111)",
        border: "1px solid rgba(0,0,0,.12)",
        borderRadius: 14,
        boxShadow: "0 18px 50px rgba(0,0,0,.18)",
        padding: "16px 18px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      <LuCookie size={20} style={{ flexShrink: 0, marginTop: 2, opacity: 0.7 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0 }}>
          {String(settings.cookie_banner_text || DEFAULT_TEXT)}
          {links.length > 0 && " "}
          {links.map((link, i) => (
            <span key={link.href}>
              {i > 0 && " · "}
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                style={{ color: config.primary_color, textDecoration: "underline" }}
              >
                {link.label}
              </a>
            </span>
          ))}
        </p>

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            onClick={() => remember("accepted")}
            style={{
              background: config.primary_color,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {mode === "consent" ? "Accept" : "Got it"}
          </button>
          {mode === "consent" && (
            <button
              onClick={() => remember("declined")}
              style={{
                background: "transparent",
                color: "inherit",
                border: "1px solid rgba(0,0,0,.2)",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Decline
            </button>
          )}
        </div>
      </div>

      {mode === "notice" && (
        <button
          onClick={() => remember("accepted")}
          aria-label="Dismiss"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "inherit",
            opacity: 0.5,
            padding: 2,
            flexShrink: 0,
          }}
        >
          <LuX size={16} />
        </button>
      )}
    </div>
  );
}
