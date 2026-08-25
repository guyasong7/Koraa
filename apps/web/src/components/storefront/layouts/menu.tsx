"use client";
/**
 * Menu — tabbed sections, price list, food-shop chrome.
 *
 * The food preset's shape, and the furthest from classic. A takeaway does not
 * want a grid of square product photographs: it wants a list you can read top
 * to bottom, name and price on one line with a leader between them, and tabs
 * to jump between parts of the menu.
 *
 * It is also the one layout that replaces the navbar and footer outright. The
 * classic chrome is a shop's — search field, account button, three columns of
 * links — where a food storefront is asked for a phone number, opening hours
 * and an address. Both live here rather than in the base renderer so no other
 * layout changes shape.
 *
 * The tab strip sticks under the navbar, which is `position: sticky; top: 0`
 * at exactly 68px tall in both the classic and the menu variant, so the two
 * offsets stay in step whichever chrome is in force.
 */
import React from "react";
import Link from "next/link";
import { useCartStore } from "@/stores/cart";
import { useStorefront } from "../../StorefrontProvider";
import type { StorefrontProduct } from "../../../types/storefront";
import type { LayoutModule } from "../registry";
import {
  EmptyCatalog,
  FooterProps,
  NavbarProps,
  PinSaveButton,
  ProductMedia,
  SectionProps,
  applyFacet,
  bool,
  deriveFacets,
  formatPrice,
  linkList,
  str,
  useCardAction,
  useFacet,
  useHasSection,
} from "../shared";
import { LuMail, LuPlus, LuShoppingBag, LuUtensils } from "react-icons/lu";

const styles = `
/* ── Chrome ─────────────────────────────────────────────────────────────
   Only the main bar sticks. The contact strip above it scrolls away, which
   is what keeps the tab strip's \`top: 68px\` honest — a sticky strip would
   push the bar down by its own height and leave a gap above the list. */
.sf-l-menu .sf-mn-strip { background: color-mix(in srgb, var(--sf-text) 92%, var(--sf-bg)); color: color-mix(in srgb, var(--sf-bg) 88%, var(--sf-text)); }
.sf-l-menu .sf-mn-strip-i { max-width: 1100px; margin: 0 auto; padding: 9px 40px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 22px; font-size: 13px; font-weight: 600; }
.sf-l-menu .sf-mn-strip a { color: inherit; text-decoration: none; opacity: .85; transition: opacity .15s; }
.sf-l-menu .sf-mn-strip a:hover { opacity: 1; text-decoration: underline; }

.sf-l-menu .sf-mn-nav { position: sticky; top: 0; z-index: 100; height: 68px; background: var(--sf-bg); border-bottom: 1px solid rgba(0,0,0,.08); }
.sf-l-menu .sf-mn-nav-i { max-width: 1100px; margin: 0 auto; padding: 0 40px; height: 100%; display: flex; align-items: center; gap: 26px; }
.sf-l-menu .sf-mn-brand { flex-shrink: 0; display: flex; align-items: center; text-decoration: none; color: var(--sf-text); }
.sf-l-menu .sf-mn-brand img { height: 40px; object-fit: contain; }
.sf-l-menu .sf-mn-brand span { font-size: 21px; font-weight: 800; }
.sf-l-menu .sf-mn-nav-links { margin-left: auto; display: flex; gap: 26px; }
.sf-l-menu .sf-mn-nav-link { color: var(--sf-text); text-decoration: none; font-size: 13px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; opacity: .6; transition: opacity .15s; }
.sf-l-menu .sf-mn-nav-link:hover { opacity: 1; }
.sf-l-menu .sf-mn-nav-actions { flex-shrink: 0; display: flex; align-items: center; gap: 10px; }
.sf-l-menu .sf-mn-order { display: inline-flex; align-items: center; height: 40px; padding: 0 18px; border-radius: var(--sf-r, 10px); background: var(--sf-primary); color: #fff; text-decoration: none; font-size: 14px; font-weight: 800; white-space: nowrap; transition: filter .15s, transform .15s; }
.sf-l-menu .sf-mn-order:hover { filter: brightness(1.08); transform: translateY(-1px); }
.sf-l-menu .sf-mn-cart { position: relative; display: flex; align-items: center; padding: 8px; border-radius: 10px; color: var(--sf-text); text-decoration: none; transition: background .15s; }
.sf-l-menu .sf-mn-cart:hover { background: rgba(0,0,0,.05); }
.sf-l-menu .sf-mn-cart-n { position: absolute; top: 0; right: 0; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 9999px; background: var(--sf-primary); color: #fff; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; }

/* Footer — a warm dark panel, inverted out of the store's own two colours so
   it lands right whether the shop is set light-on-dark or dark-on-light. */
.sf-l-menu .sf-mn-foot { background: color-mix(in srgb, var(--sf-text) 94%, var(--sf-bg)); color: color-mix(in srgb, var(--sf-bg) 92%, var(--sf-text)); }
.sf-l-menu .sf-mn-foot-i { max-width: 1100px; margin: 0 auto; padding: 56px 40px 36px; display: flex; flex-wrap: wrap; gap: 40px 48px; }
.sf-l-menu .sf-mn-foot-brand { flex: 1 1 260px; min-width: 0; }
.sf-l-menu .sf-mn-foot-col { flex: 0 1 170px; min-width: 0; }
.sf-l-menu .sf-mn-foot-col--wide { flex: 0 1 230px; }
.sf-l-menu .sf-mn-foot h2 { font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; opacity: .55; margin-bottom: 14px; }
.sf-l-menu .sf-mn-foot-name { font-family: var(--sf-heading-font), sans-serif; font-size: 24px; font-weight: 800; letter-spacing: -.02em; }
.sf-l-menu .sf-mn-foot-tag { font-size: 14px; line-height: 1.65; opacity: .72; margin-top: 10px; max-width: 32ch; }
.sf-l-menu .sf-mn-foot ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 9px; }
.sf-l-menu .sf-mn-foot a { color: inherit; text-decoration: none; font-size: 14px; opacity: .72; transition: opacity .15s; }
.sf-l-menu .sf-mn-foot a:hover { opacity: 1; }
.sf-l-menu .sf-mn-hours { display: flex; justify-content: space-between; gap: 14px; font-size: 14px; }
.sf-l-menu .sf-mn-hours span:first-child { opacity: .72; }
.sf-l-menu .sf-mn-hours span:last-child { font-weight: 600; font-variant-numeric: tabular-nums; }
.sf-l-menu .sf-mn-addr { font-size: 14px; line-height: 1.7; opacity: .72; white-space: pre-line; }
.sf-l-menu .sf-mn-social { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
.sf-l-menu .sf-mn-social a { border: 1px solid color-mix(in srgb, var(--sf-bg) 28%, transparent); border-radius: 9999px; padding: 6px 14px; font-size: 13px; font-weight: 700; opacity: .8; }
.sf-l-menu .sf-mn-social a:hover { border-color: color-mix(in srgb, var(--sf-bg) 55%, transparent); }
.sf-l-menu .sf-mn-foot-cta { display: inline-flex; align-items: center; height: 42px; padding: 0 20px; margin-top: 16px; border-radius: var(--sf-r, 10px); background: var(--sf-primary); color: #fff; font-size: 14px; font-weight: 800; opacity: 1; transition: filter .15s; }
.sf-l-menu .sf-mn-foot-cta:hover { filter: brightness(1.08); opacity: 1; }
.sf-l-menu .sf-mn-foot-bottom { max-width: 1100px; margin: 0 auto; padding: 18px 40px 40px; border-top: 1px solid color-mix(in srgb, var(--sf-bg) 16%, transparent); display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 20px; font-size: 13px; opacity: .55; }

.sf-l-menu .sf-mn-hero { position: relative; height: 400px; display: flex; align-items: center; justify-content: center; text-align: center; overflow: hidden; }
.sf-l-menu .sf-mn-hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.sf-l-menu .sf-mn-scrim { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(0,0,0,.45) 0%, rgba(0,0,0,.68) 100%); }
.sf-l-menu .sf-mn-hero-c { position: relative; z-index: 1; padding: 0 24px; max-width: 720px; }
.sf-l-menu .sf-mn-eyebrow { display: inline-block; padding: 5px 14px; border: 1.5px solid rgba(255,255,255,.5); border-radius: 9999px; color: #fff; font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; margin-bottom: 20px; }
.sf-l-menu .sf-mn-hero-h { font-size: clamp(32px, 5vw, 56px); font-weight: 800; color: #fff; line-height: 1.08; letter-spacing: -.02em; margin-bottom: 14px; }
.sf-l-menu .sf-mn-hero-p { color: rgba(255,255,255,.86); font-size: 17px; line-height: 1.6; margin-bottom: 28px; }
.sf-l-menu .sf-mn-hero-btn { padding: 14px 32px; background: var(--sf-primary); color: #fff; border: none; border-radius: var(--sf-r, 10px); font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; transition: filter .2s, transform .2s; }
.sf-l-menu .sf-mn-hero-btn:hover { filter: brightness(1.1); transform: translateY(-2px); }

/* Tabs — stick directly below the 68px navbar */
.sf-l-menu .sf-mn-tabs { position: sticky; top: 68px; z-index: 90; background: var(--sf-bg); border-bottom: 1px solid rgba(0,0,0,.08); }
.sf-l-menu .sf-mn-tabs-i { max-width: 1100px; margin: 0 auto; padding: 0 40px; display: flex; gap: 30px; overflow-x: auto; scrollbar-width: none; }
.sf-l-menu .sf-mn-tabs-i::-webkit-scrollbar { display: none; }
.sf-l-menu .sf-mn-tab { flex-shrink: 0; padding: 17px 0; background: none; border: none; border-bottom: 2px solid transparent; color: var(--sf-text); font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; opacity: .55; transition: opacity .15s, border-color .15s, color .15s; }
.sf-l-menu .sf-mn-tab:hover { opacity: 1; }
.sf-l-menu .sf-mn-tab.active { opacity: 1; color: var(--sf-primary); border-bottom-color: var(--sf-primary); }
.sf-l-menu .sf-mn-tab span { font-weight: 500; opacity: .6; }

/* Price list */
.sf-l-menu .sf-mn-list { max-width: 1100px; margin: 0 auto; padding: 56px 40px; }
.sf-l-menu .sf-mn-list-h { font-size: 26px; font-weight: 800; letter-spacing: -.02em; margin-bottom: 26px; }
.sf-l-menu .sf-mn-row { display: flex; align-items: flex-start; gap: 18px; padding: 20px 0; border-bottom: 1px solid rgba(0,0,0,.07); }
.sf-l-menu .sf-mn-row:last-child { border-bottom: none; }
.sf-l-menu .sf-mn-thumb { width: 58px; height: 58px; flex-shrink: 0; border-radius: 50%; overflow: hidden; background: rgba(0,0,0,.05); display: flex; align-items: center; justify-content: center; }
.sf-l-menu .sf-mn-thumb img { width: 100%; height: 100%; object-fit: cover; }
.sf-l-menu .sf-mn-body { flex: 1; min-width: 0; }
.sf-l-menu .sf-mn-top { display: flex; align-items: baseline; gap: 8px; }
.sf-l-menu .sf-mn-name { font-size: 16px; font-weight: 700; }
.sf-l-menu .sf-mn-lead { flex: 1; min-width: 16px; border-bottom: 1px dotted rgba(0,0,0,.28); transform: translateY(-4px); }
.sf-l-menu .sf-mn-price { font-size: 16px; font-weight: 800; color: var(--sf-primary); white-space: nowrap; }
.sf-l-menu .sf-mn-desc { font-size: 13px; line-height: 1.55; opacity: .6; margin-top: 4px; max-width: 62ch; }
.sf-l-menu .sf-mn-out { font-size: 11px; font-weight: 700; color: #ef4444; margin-top: 5px; }
.sf-l-menu .sf-mn-add { flex-shrink: 0; width: 38px; height: 38px; margin-top: 2px; border-radius: 50%; background: var(--sf-primary); color: #fff; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: filter .15s, transform .15s; }
.sf-l-menu .sf-mn-add:hover:not(:disabled) { filter: brightness(1.1); transform: scale(1.06); }
.sf-l-menu .sf-mn-add:disabled { background: rgba(0,0,0,.12); cursor: default; }

/* Specials strip */
.sf-l-menu .sf-mn-spec { max-width: 1100px; margin: 0 auto; padding: 48px 40px 0; }
.sf-l-menu .sf-mn-spec-h { font-size: 22px; font-weight: 800; margin-bottom: 20px; }
.sf-l-menu .sf-mn-spec-s { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; scrollbar-width: none; }
.sf-l-menu .sf-mn-spec-s::-webkit-scrollbar { display: none; }
.sf-l-menu .sf-mn-spec-c { flex: 0 0 208px; border-radius: var(--sf-card-r, 14px); overflow: hidden; background: #fff; border: 1px solid rgba(0,0,0,.07); cursor: pointer; transition: transform .2s, box-shadow .2s; }
.sf-l-menu .sf-mn-spec-c:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.1); }
.sf-l-menu .sf-mn-spec-i { position: relative; aspect-ratio: 4/3; background: rgba(0,0,0,.05); display: flex; align-items: center; justify-content: center; }
.sf-l-menu .sf-mn-spec-i img { width: 100%; height: 100%; object-fit: var(--sf-img-fit, cover); }
.sf-l-menu .sf-mn-spec-b { padding: 12px 14px; }
.sf-l-menu .sf-mn-spec-n { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sf-l-menu .sf-mn-spec-p { font-size: 14px; font-weight: 800; color: var(--sf-primary); margin-top: 4px; }

@media (max-width: 900px) {
  .sf-l-menu .sf-mn-strip-i { padding: 8px 16px; gap: 4px 14px; font-size: 12px; }
  .sf-l-menu .sf-mn-nav-i { padding: 0 16px; gap: 14px; }
  .sf-l-menu .sf-mn-nav-links { display: none; }
  .sf-l-menu .sf-mn-nav-actions { margin-left: auto; }
  .sf-l-menu .sf-mn-brand img { height: 34px; }
  .sf-l-menu .sf-mn-brand span { font-size: 18px; }
  .sf-l-menu .sf-mn-foot-i { padding: 40px 16px 28px; gap: 30px 32px; }
  .sf-l-menu .sf-mn-foot-bottom { padding: 16px 16px 32px; }
  .sf-l-menu .sf-mn-hero { height: 320px; }
  .sf-l-menu .sf-mn-tabs-i { padding: 0 16px; gap: 22px; }
  .sf-l-menu .sf-mn-list { padding: 36px 16px; }
  .sf-l-menu .sf-mn-spec { padding: 32px 16px 0; }
  .sf-l-menu .sf-mn-thumb { width: 48px; height: 48px; }
  .sf-l-menu .sf-mn-list-h { font-size: 22px; }
}

/* Below this the strip has room for one line only, and the phone number is
   the one a hungry visitor came for. */
@media (max-width: 560px) {
  .sf-l-menu .sf-mn-strip-email { display: none; }
  .sf-l-menu .sf-mn-order { padding: 0 14px; font-size: 13px; }
}
`;

function Tabs() {
  const { products } = useStorefront();
  const { active, setActive } = useFacet();
  const facets = deriveFacets(products || []);
  if (facets.length < 2) return null;

  return (
    <div className="sf-mn-tabs">
      <div className="sf-mn-tabs-i">
        {facets.map(f => (
          <button
            key={f.id}
            className={`sf-mn-tab${active === f.id ? " active" : ""}`}
            onClick={() => setActive(f.id)}
          >
            {f.label} <span>({f.count})</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MenuRow({ p, store }: { p: StorefrontProduct; store: SectionProps["store"] }) {
  const action = useCardAction();
  const act = action(p, { soldOut: "Unavailable" });

  return (
    <div className="sf-mn-row">
      <div className="sf-mn-thumb">
        <ProductMedia product={p} placeholder={<LuUtensils size={20} color="rgba(0,0,0,0.2)" />} />
      </div>
      <div className="sf-mn-body">
        <div className="sf-mn-top">
          <span className="sf-mn-name">{p.name}</span>
          <span className="sf-mn-lead" />
          <span className="sf-mn-price">{formatPrice(store, p.base_price)}</span>
        </div>
        {p.short_description && <p className="sf-mn-desc">{p.short_description}</p>}
        {/* The button is a bare plus, so the reason it is dead has to be in
            the row's own words. */}
        {act.kind === "cart" && act.disabled && <p className="sf-mn-out">{act.label}</p>}
      </div>
      {act.kind !== "none" && (
        <button
          className="sf-mn-add"
          disabled={act.disabled}
          onClick={act.run}
          aria-label={act.kind === "enquire" ? `Enquire about ${p.name}` : `Add ${p.name}`}
        >
          {act.kind === "enquire" ? <LuMail size={16} /> : <LuPlus size={17} />}
        </button>
      )}
    </div>
  );
}

function MenuCategories({ s }: SectionProps) {
  if (!s.enabled) return null;
  return <Tabs />;
}

function MenuCatalog({ s, store }: SectionProps) {
  const { products } = useStorefront();
  const { active } = useFacet();
  // The tabs are the same control whether they come from the categories
  // section or from here, so only render our own strip when that section is
  // absent or switched off.
  const hasCategories = useHasSection("categories");
  if (!s.enabled) return null;

  const all = products || [];
  const facets = deriveFacets(all);
  const toShow = applyFacet(all, active);
  const heading = facets.find(f => f.id === active)?.label;

  return (
    <>
      {!hasCategories && <Tabs />}
      <section className="sf-mn-list">
        <h2 className="sf-mn-list-h sf-d">
          {active === "all" ? str(s.settings.title, "Our Menu") : heading || str(s.settings.title, "Our Menu")}
        </h2>
        {toShow.length === 0
          ? <EmptyCatalog label={active === "all" ? "Nothing on the menu yet." : "Nothing in this section yet."} />
          : <div>{toShow.map(p => <MenuRow key={p.id} p={p} store={store} />)}</div>}
      </section>
    </>
  );
}

function MenuFeatured({ s, store }: SectionProps) {
  const { products } = useStorefront();
  const action = useCardAction();
  if (!s.enabled) return null;

  const all = products || [];
  const featured = all.filter(p => p.is_featured).slice(0, 8);
  const toShow = featured.length > 0 ? featured : all.slice(0, 8);
  if (toShow.length === 0) return null;

  return (
    <section className="sf-mn-spec">
      <h2 className="sf-mn-spec-h sf-d">{str(s.settings.title, "Today's Specials")}</h2>
      <div className="sf-mn-spec-s">
        {toShow.map(p => (
          <article key={p.id} className="sf-mn-spec-c" onClick={action(p).run}>
            <div className="sf-mn-spec-i">
              <ProductMedia product={p} placeholder={<LuUtensils size={26} color="rgba(0,0,0,0.18)" />} />
              <PinSaveButton product={p} store={store} />
            </div>
            <div className="sf-mn-spec-b">
              <p className="sf-mn-spec-n">{p.name}</p>
              <p className="sf-mn-spec-p">{formatPrice(store, p.base_price)}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MenuHero({ s, store }: SectionProps) {
  if (!s.enabled) return null;
  const image = str(s.settings.image);

  return (
    <section className="sf-mn-hero">
      {image
        ? <img src={image} alt="" className="sf-mn-hero-img" />
        : <div className="sf-mn-hero-img" style={{ background: "linear-gradient(135deg, var(--sf-primary), var(--sf-accent))" }} />}
      {bool(s.settings.overlay, true) && <div className="sf-mn-scrim" />}
      <div className="sf-mn-hero-c">
        <span className="sf-mn-eyebrow">{store.name}</span>
        <h1 className="sf-mn-hero-h sf-d">{str(s.settings.title, `Welcome to ${store.name}`)}</h1>
        <p className="sf-mn-hero-p">{str(s.settings.subtitle, store.tagline || "Freshly made, every day.")}</p>
        <button className="sf-mn-hero-btn">{str(s.settings.button_text, "See the menu")}</button>
      </div>
    </section>
  );
}

/**
 * A `wa.me` link from a stored WhatsApp number.
 *
 * Merchants type these with spaces, plus signs and dashes; `wa.me` accepts
 * digits only. Empty means "no WhatsApp", so the caller can skip the link
 * rather than render one that opens nothing.
 */
function waLink(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

/**
 * A `{label, value}` list out of the footer section's settings — opening hours.
 *
 * Also accepts `{day, hours}`, which is what the pairing reads like when it is
 * typed by hand. Absent or malformed gives an empty list, and the footer then
 * renders no hours column at all: a food storefront with invented times on it
 * is worse than one that stays quiet about them.
 */
function pairList(v: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map(x => ({ label: str(x.label, str(x.day)), value: str(x.value, str(x.hours)) }))
    .filter(p => p.label !== "" && p.value !== "");
}

/**
 * Navbar — contact strip over a slim sticky bar.
 *
 * A takeaway's navbar is not a shop's. The thing a visitor wants is the phone
 * number, so it leads: once in the strip as a full "call to order" line, and
 * again as the bar's only filled button. The product search that heads the
 * classic navbar is gone — a menu you can read end to end in one screen does
 * not need one, and it was taking the width the phone number now uses.
 */
function MenuNavbar({ store, cfg }: NavbarProps) {
  const getCartCount = useCartStore((state: any) => state.getCartCount);
  const count = getCartCount();
  const links = linkList(cfg.navigation?.links, [
    { label: "Menu", url: "#" },
    { label: "Specials", url: "#" },
    { label: "About", url: "#" },
  ]);
  const whatsapp = waLink(store.whatsapp);

  return (
    <>
      {(store.phone || whatsapp || store.email) && (
        <div className="sf-mn-strip">
          <div className="sf-mn-strip-i">
            {store.phone && <a href={`tel:${store.phone}`}>Call to order · {store.phone}</a>}
            {whatsapp && <a href={whatsapp} target="_blank" rel="noopener">Order on WhatsApp</a>}
            {store.email && <a href={`mailto:${store.email}`} className="sf-mn-strip-email">{store.email}</a>}
          </div>
        </div>
      )}

      <header className="sf-mn-nav">
        <div className="sf-mn-nav-i">
          <a href="#" className="sf-mn-brand">
            {store.logo
              ? <img src={store.logo} alt={store.name} />
              : <span className="sf-d">{store.name}</span>}
          </a>

          <nav className="sf-mn-nav-links">
            {links.map((l, i) => <a key={i} href={l.url} className="sf-mn-nav-link">{l.label}</a>)}
          </nav>

          <div className="sf-mn-nav-actions">
            {store.phone && <a href={`tel:${store.phone}`} className="sf-mn-order">Order now</a>}
            <Link href="/checkout" className="sf-mn-cart" aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}>
              <LuShoppingBag size={20} />
              {count > 0 && <span className="sf-mn-cart-n">{count}</span>}
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}

/**
 * Footer — the details a food storefront is asked for.
 *
 * Hours, address and how to reach you, in that order, on a dark panel that
 * closes the page. Every block is conditional on real data: a shop that has
 * filled in nothing but its name gets its name, and nothing that pretends to
 * be an opening time or a street.
 */
function MenuFooter({ settings, store }: FooterProps) {
  const links = linkList(settings.links, [
    { label: "Menu", url: "#" },
    { label: "Specials", url: "#" },
    { label: "About", url: "#" },
  ]);
  const hours = pairList(settings.hours);
  const address = str(settings.address);
  const note = str(settings.note);
  const whatsapp = waLink(store.whatsapp);

  return (
    <footer className="sf-mn-foot">
      <div className="sf-mn-foot-i">
        <div className="sf-mn-foot-brand">
          <p className="sf-mn-foot-name">{store.name}</p>
          <p className="sf-mn-foot-tag">
            {str(settings.tagline, store.tagline || "Freshly made, every day.")}
          </p>
          {(store.instagram || store.facebook || whatsapp) && (
            <div className="sf-mn-social">
              {store.instagram && <a href={store.instagram} target="_blank" rel="noopener">Instagram</a>}
              {store.facebook && <a href={store.facebook} target="_blank" rel="noopener">Facebook</a>}
              {whatsapp && <a href={whatsapp} target="_blank" rel="noopener">WhatsApp</a>}
            </div>
          )}
        </div>

        {hours.length > 0 && (
          <div className="sf-mn-foot-col sf-mn-foot-col--wide">
            <h2>Opening hours</h2>
            <ul>
              {hours.map((h, i) => (
                <li key={i} className="sf-mn-hours"><span>{h.label}</span><span>{h.value}</span></li>
              ))}
            </ul>
          </div>
        )}

        {address && (
          <div className="sf-mn-foot-col">
            <h2>Find us</h2>
            <p className="sf-mn-addr">{address}</p>
          </div>
        )}

        <div className="sf-mn-foot-col">
          <h2>Menu</h2>
          <ul>{links.map((l, i) => <li key={i}><a href={l.url}>{l.label}</a></li>)}</ul>
        </div>

        {(store.phone || store.email) && (
          <div className="sf-mn-foot-col">
            <h2>Order</h2>
            <ul>
              {store.phone && <li><a href={`tel:${store.phone}`}>{store.phone}</a></li>}
              {store.email && <li><a href={`mailto:${store.email}`}>{store.email}</a></li>}
            </ul>
            {store.phone && <a href={`tel:${store.phone}`} className="sf-mn-foot-cta">Call to order</a>}
          </div>
        )}
      </div>

      <div className="sf-mn-foot-bottom">
        <span>© {new Date().getFullYear()} {store.name}</span>
        {note && <span>{note}</span>}
      </div>
    </footer>
  );
}

const menu: LayoutModule = {
  styles,
  navbar: MenuNavbar,
  footer: MenuFooter,
  sections: {
    hero: MenuHero,
    categories: MenuCategories,
    catalog: MenuCatalog,
    featured_products: MenuFeatured,
  },
};

export default menu;
