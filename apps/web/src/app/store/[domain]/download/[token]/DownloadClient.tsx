"use client";
/**
 * The page a paid download link opens.
 *
 * A shopper on a Koraa storefront has no account, so the token in the URL is
 * the only credential there is — which is exactly why this page never links at
 * a media file. Every button points back at the API, which checks the grant and
 * streams the bytes itself.
 *
 * It is deliberately plain rather than a full storefront render. All the
 * manifest carries of the shop is its name, logo, contact details and primary
 * colour (see `PublicDownloadView`), so dressing this in the merchant's fonts
 * and background would mean guessing at values that are not here. It borrows
 * the logo and the one colour, and leaves the rest quiet — the buyer came for a
 * file, not for the brand.
 *
 * An expired or used-up link is not an error page. It renders the same purchase
 * details plus the merchant's email and phone, because the only thing that can
 * help at that point is asking the shop for a new link.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LuCircleAlert,
  LuClock,
  LuDownload,
  LuFile,
  LuLoader,
  LuMail,
  LuPhone,
  LuStore,
} from "react-icons/lu";

import { apiOrigin, publicStorefrontApi, type DownloadManifest } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { STOREFRONT_DEFAULTS } from "@/components/storefront/theme";

/** What the buyer is told, per state. The heading doubles as the answer. */
const STATE_COPY: Record<DownloadManifest["state"], { title: string; note: string }> = {
  ready: {
    title: "Your download is ready",
    note: "Save the file somewhere you will find it again — each download counts against this link.",
  },
  expired: {
    title: "This link has expired",
    note: "The shop can send you a fresh one. Your purchase still stands, so mention the reference below.",
  },
  exhausted: {
    title: "This link has been used up",
    note: "It reached its download limit. The shop can reset it — mention the reference below when you ask.",
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/** `null` means unlimited, which is a promise worth stating out loud. */
function remainingLabel(remaining: number | null): string {
  if (remaining === null) return "Unlimited downloads";
  if (remaining === 1) return "1 download left";
  return `${remaining} downloads left`;
}

/**
 * The Koraa bar, written locally rather than shared with the renderer.
 *
 * `StorefrontRenderer`'s badge is styled by `.sf-koraa` inside that component's
 * own stylesheet, which is not injected here — reusing the component would put
 * unstyled markup on the page.
 */
function KoraaBar() {
  const rootDomain = process.env.KORAA_PUBLIC_ROOT_DOMAIN || "localhost:3000";
  const scheme =
    rootDomain.startsWith("localhost") || rootDomain.startsWith("127.") ? "http" : "https";
  return (
    <p className="dl-koraa">
      <a href={`${scheme}://${rootDomain}`} target="_blank" rel="noopener">
        Built with <strong>Koraa</strong>
      </a>
    </p>
  );
}

export default function DownloadClient({ token }: { token: string }) {
  const [manifest, setManifest] = useState<DownloadManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  /** Cleared on unmount so a refresh cannot land on a gone component. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const { data } = await publicStorefrontApi.getDownload(token);
        setManifest(data);
        setFailure(null);
      } catch (error) {
        const response = (error as { response?: { data?: { detail?: string } } }).response;
        // Only on a first load: a failed background refresh must not replace a
        // page the buyer is reading with an error.
        if (!quiet) {
          setFailure(response?.data?.detail || "This download link could not be opened.");
        }
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  /**
   * Re-read the manifest shortly after a file is clicked.
   *
   * The link is a plain `<a>`, so the browser streams straight to disk and the
   * page never navigates — which also means nothing tells us the transfer
   * started. The API counts the download when it opens the file, well before
   * the bytes finish, so a short delay is enough to read the true remaining
   * count rather than guessing at it here.
   */
  const scheduleRefresh = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(true), 2000);
  };

  if (loading) {
    return (
      <main className="dl-wrap">
        <style>{STYLES}</style>
        <div className="dl-card dl-centre">
          <LuLoader size={26} className="dl-spin" />
          <p className="dl-muted">Checking your link…</p>
        </div>
      </main>
    );
  }

  if (failure || !manifest) {
    return (
      <main className="dl-wrap">
        <style>{STYLES}</style>
        <div className="dl-card dl-centre">
          <span className="dl-badge dl-badge-bad">
            <LuCircleAlert size={22} />
          </span>
          <h1>Link not valid</h1>
          {/* No shop is known on a bad token — the API says nothing about a
              link it will not resolve, so there is nobody to point at. */}
          <p className="dl-muted">{failure}</p>
          <p className="dl-muted dl-small">
            Check the link in your email is complete. If it still fails, reply to that email and the
            shop can send you another.
          </p>
        </div>
        <KoraaBar />
      </main>
    );
  }

  const { store, files, state } = manifest;
  const copy = STATE_COPY[state];
  const ready = state === "ready";
  const purchased = formatDate(manifest.purchased_at);
  const expires = formatDate(manifest.expires_at);

  return (
    <main className="dl-wrap" style={{ "--dl-brand": store.primary_color } as React.CSSProperties}>
      <style>{STYLES}</style>

      <header className="dl-head">
        <a className="dl-shop" href={store.url}>
          {store.logo ? (
            <img src={store.logo} alt={store.name} />
          ) : (
            <span className="dl-shop-fallback">
              <LuStore size={16} /> {store.name}
            </span>
          )}
        </a>
      </header>

      <div className="dl-card">
        <span className={`dl-badge${ready ? "" : " dl-badge-warn"}`}>
          {ready ? <LuDownload size={22} /> : <LuClock size={22} />}
        </span>
        <h1>{copy.title}</h1>
        <p className="dl-product">{manifest.product_name}</p>
        <p className="dl-muted">{copy.note}</p>

        <dl className="dl-facts">
          <div>
            <dt>Order</dt>
            <dd>{manifest.reference}</dd>
          </div>
          {purchased && (
            <div>
              <dt>Purchased</dt>
              <dd>{purchased}</dd>
            </div>
          )}
          {ready && (
            <div>
              <dt>Remaining</dt>
              <dd>{remainingLabel(manifest.downloads_remaining)}</dd>
            </div>
          )}
          {expires && (
            <div>
              <dt>{ready ? "Available until" : "Expired"}</dt>
              <dd>{expires}</dd>
            </div>
          )}
        </dl>

        {files.length === 0 ? (
          <p className="dl-empty">
            <LuCircleAlert size={15} /> There are no files attached to this purchase yet. The shop
            has been paid, so ask them to upload it and your link will start working.
          </p>
        ) : (
          <ul className="dl-files">
            {files.map(file => (
              <li key={file.id}>
                <span className="dl-file-icon">
                  <LuFile size={16} />
                </span>
                <span className="dl-file-meta">
                  <strong>{file.name}</strong>
                  <span className="dl-muted dl-small">{formatBytes(file.size_bytes)}</span>
                </span>
                {ready ? (
                  <a
                    className="dl-get"
                    href={`${apiOrigin()}${file.url}`}
                    onClick={scheduleRefresh}
                  >
                    <LuDownload size={14} /> Download
                  </a>
                ) : (
                  <span className="dl-get dl-get-off">Unavailable</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {!ready && (store.email || store.phone) && (
          <div className="dl-ask">
            <p className="dl-ask-t">Ask {store.name} for a new link</p>
            <div className="dl-ask-links">
              {store.email && (
                <a
                  href={`mailto:${store.email}?subject=${encodeURIComponent(
                    `Download link for ${manifest.reference}`,
                  )}`}
                >
                  <LuMail size={14} /> {store.email}
                </a>
              )}
              {store.phone && (
                <a href={`tel:${store.phone}`}>
                  <LuPhone size={14} /> {store.phone}
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <a className="dl-back" href={store.url}>
        Back to {store.name}
      </a>
      <KoraaBar />
    </main>
  );
}

const STYLES = `
/* Only a fallback: line 177 sets --dl-brand from the store's own
   primary_color inline, so this is what a shop that never picked one
   gets. Koraa's default rather than the violet it used to be. */
.dl-wrap { --dl-brand: ${STOREFRONT_DEFAULTS.primary}; --dl-line: rgba(15,17,23,.1); min-height: 100vh; display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 40px 20px 32px; background: #f6f7f9; color: #0f1117; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.dl-wrap * { box-sizing: border-box; }

.dl-head { width: 100%; max-width: 560px; display: flex; justify-content: center; }
.dl-shop { text-decoration: none; color: inherit; display: inline-flex; align-items: center; }
.dl-shop img { max-height: 44px; max-width: 200px; object-fit: contain; }
.dl-shop-fallback { display: inline-flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 800; letter-spacing: -.01em; }

.dl-card { width: 100%; max-width: 560px; background: #fff; border: 1px solid var(--dl-line); border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px rgba(15,17,23,.06); }
.dl-centre { display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; padding: 56px 32px; }

.dl-badge { width: 48px; height: 48px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 18px; background: color-mix(in srgb, var(--dl-brand) 14%, #fff); color: var(--dl-brand); }
.dl-badge-warn { background: rgba(245,158,11,.14); color: #b45309; }
.dl-badge-bad { background: rgba(239,68,68,.12); color: #dc2626; margin-bottom: 0; }

.dl-card h1 { font-size: 22px; font-weight: 800; line-height: 1.25; letter-spacing: -.02em; margin: 0 0 6px; }
.dl-product { font-size: 15px; font-weight: 600; color: var(--dl-brand); margin: 0 0 10px; }
.dl-muted { font-size: 14px; line-height: 1.6; color: #565b66; margin: 0; }
.dl-small { font-size: 12.5px; }

.dl-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 14px 20px; margin: 24px 0 0; padding: 18px 0 0; border-top: 1px solid var(--dl-line); }
.dl-facts dt { font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #7b808c; margin-bottom: 4px; }
.dl-facts dd { font-size: 14px; font-weight: 600; margin: 0; }

.dl-files { list-style: none; padding: 0; margin: 24px 0 0; display: flex; flex-direction: column; gap: 10px; }
.dl-files li { display: flex; align-items: center; gap: 14px; padding: 14px; border: 1px solid var(--dl-line); border-radius: 12px; }
.dl-file-icon { width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: #f2f3f5; color: #565b66; }
/* min-width:0 so a long filename ellipsises instead of shoving the button out. */
.dl-file-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dl-file-meta strong { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dl-get { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; padding: 9px 15px; border-radius: 9px; background: var(--dl-brand); color: #fff; font-size: 13px; font-weight: 700; text-decoration: none; transition: filter .15s; }
.dl-get:hover { filter: brightness(1.09); }
.dl-get-off { background: #eceef1; color: #8a8f99; cursor: default; }

.dl-empty { display: flex; align-items: flex-start; gap: 9px; margin: 24px 0 0; padding: 14px; border: 1px dashed var(--dl-line); border-radius: 12px; font-size: 13px; line-height: 1.55; color: #565b66; }
.dl-empty svg { flex-shrink: 0; margin-top: 2px; }

.dl-ask { margin: 24px 0 0; padding: 18px 0 0; border-top: 1px solid var(--dl-line); }
.dl-ask-t { font-size: 13px; font-weight: 700; margin: 0 0 10px; }
.dl-ask-links { display: flex; flex-wrap: wrap; gap: 8px; }
.dl-ask-links a { display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border: 1px solid var(--dl-line); border-radius: 9px; font-size: 13px; font-weight: 600; color: #0f1117; text-decoration: none; transition: border-color .15s; }
.dl-ask-links a:hover { border-color: var(--dl-brand); color: var(--dl-brand); }

.dl-back { font-size: 13.5px; font-weight: 600; color: #565b66; text-decoration: none; }
.dl-back:hover { color: var(--dl-brand); }

.dl-koraa { margin: 0; font-size: 12.5px; }
.dl-koraa a { color: #8a8f99; text-decoration: none; }
.dl-koraa a:hover { color: #0f1117; }

.dl-spin { animation: dl-spin 1s linear infinite; color: var(--dl-brand); }
@keyframes dl-spin { to { transform: rotate(360deg); } }

@media (max-width: 560px) {
  .dl-card { padding: 24px 20px; border-radius: 14px; }
  .dl-card h1 { font-size: 19px; }
  /* Stacked: the button beside a filename has no room left at this width. */
  .dl-files li { flex-wrap: wrap; }
  .dl-get { width: 100%; justify-content: center; }
}
`;
