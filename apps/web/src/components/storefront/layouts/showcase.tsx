"use client";
/**
 * Showcase — no-photography cards.
 *
 * The digital preset's shape. A template, an ebook or a licence key has no
 * product photograph, so the classic card's square image frame renders as an
 * empty grey box with a shopping-bag glyph in it — the whole grid looks
 * unfinished. Here the frame is replaced by a typographic tile built from the
 * palette, carrying the product's initials, and the cart action is framed as
 * instant access rather than shipping.
 *
 * Tile treatments rotate by index so a grid of them has some rhythm; the
 * rotation is positional, never random, so server and client render the same
 * thing.
 */
import React from "react";
import { useStorefront } from "../../StorefrontProvider";
import type { StorefrontProduct } from "../../../types/storefront";
import type { LayoutModule } from "../registry";
import {
  EmptyCatalog,
  SectionProps,
  applyFacet,
  deriveFacets,
  formatPrice,
  initials,
  str,
  useCardAction,
  useFacet,
} from "../shared";
import { LuDownload, LuMail, LuSparkles, LuZap } from "react-icons/lu";

const styles = `
/* Hero — centred, gradient, no photograph */
.sf-l-showcase .sf-sc-hero { position: relative; padding: 104px 40px 96px; text-align: center; overflow: hidden; background: linear-gradient(160deg, color-mix(in srgb, var(--sf-primary) 12%, var(--sf-bg)) 0%, var(--sf-bg) 55%, color-mix(in srgb, var(--sf-accent) 10%, var(--sf-bg)) 100%); }
.sf-l-showcase .sf-sc-hero-c { position: relative; z-index: 1; max-width: 740px; margin: 0 auto; }
.sf-l-showcase .sf-sc-eyebrow { display: inline-flex; align-items: center; gap: 7px; padding: 6px 15px; border-radius: 9999px; background: color-mix(in srgb, var(--sf-primary) 12%, transparent); color: var(--sf-primary); font-size: 12px; font-weight: 700; letter-spacing: .04em; margin-bottom: 22px; }
.sf-l-showcase .sf-sc-h { font-size: clamp(34px, 4.6vw, 60px); font-weight: 800; line-height: 1.06; letter-spacing: -.03em; margin-bottom: 18px; }
.sf-l-showcase .sf-sc-sub { font-size: 17px; line-height: 1.65; opacity: .68; margin-bottom: 34px; }
.sf-l-showcase .sf-sc-cta { padding: 15px 34px; background: var(--sf-primary); color: #fff; border: none; border-radius: var(--sf-r, 10px); font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; transition: filter .2s, transform .2s; }
.sf-l-showcase .sf-sc-cta:hover { filter: brightness(1.1); transform: translateY(-2px); }
.sf-l-showcase .sf-sc-trust { display: flex; justify-content: center; gap: 26px; flex-wrap: wrap; margin-top: 30px; font-size: 13px; opacity: .6; }
.sf-l-showcase .sf-sc-trust span { display: inline-flex; align-items: center; gap: 6px; }

/* Grid */
.sf-l-showcase .sf-sc-sec { max-width: 1280px; margin: 0 auto; padding: 72px 40px; }
.sf-l-showcase .sf-sc-sec-t { font-size: 26px; font-weight: 800; letter-spacing: -.02em; margin-bottom: 28px; }
.sf-l-showcase .sf-sc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 22px; }
.sf-l-showcase .sf-sc-card { display: flex; flex-direction: column; border: 1.5px solid rgba(0,0,0,.08); border-radius: var(--sf-card-r, 14px); overflow: hidden; transition: transform .2s, box-shadow .2s, border-color .2s; }
.sf-l-showcase .sf-sc-card:hover { transform: translateY(-4px); box-shadow: 0 14px 36px rgba(0,0,0,.1); border-color: color-mix(in srgb, var(--sf-primary) 40%, transparent); }
.sf-l-showcase .sf-sc-tile { aspect-ratio: 16/10; display: flex; align-items: center; justify-content: center; position: relative; }
.sf-l-showcase .sf-sc-mark { font-size: 46px; font-weight: 800; letter-spacing: -.04em; color: #fff; opacity: .96; }
.sf-l-showcase .sf-sc-flag { position: absolute; top: 12px; right: 12px; padding: 4px 10px; border-radius: 9999px; background: rgba(255,255,255,.22); color: #fff; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; backdrop-filter: blur(4px); }
.sf-l-showcase .sf-sc-cb { padding: 18px; flex: 1; display: flex; flex-direction: column; }
.sf-l-showcase .sf-sc-name { font-size: 16px; font-weight: 700; line-height: 1.35; margin-bottom: 7px; }
.sf-l-showcase .sf-sc-desc { font-size: 13px; line-height: 1.55; opacity: .6; margin-bottom: 16px; }
.sf-l-showcase .sf-sc-foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.sf-l-showcase .sf-sc-price { font-size: 18px; font-weight: 800; color: var(--sf-primary); }
.sf-l-showcase .sf-sc-get { padding: 9px 16px; background: var(--sf-primary); color: #fff; border: none; border-radius: var(--sf-r, 10px); font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: filter .15s; }
.sf-l-showcase .sf-sc-get:hover:not(:disabled) { filter: brightness(1.1); }
.sf-l-showcase .sf-sc-get:disabled { background: color-mix(in srgb, var(--sf-text) 22%, transparent); color: var(--sf-text); opacity: .6; cursor: default; }

@media (max-width: 900px) {
  .sf-l-showcase .sf-sc-hero { padding: 64px 20px 56px; }
  .sf-l-showcase .sf-sc-sec { padding: 48px 20px; }
  .sf-l-showcase .sf-sc-grid { grid-template-columns: 1fr; }
  .sf-l-showcase .sf-sc-trust { gap: 16px; }
}
`;

/**
 * Tile backgrounds, rotated by position in the grid.
 *
 * Mixed from the merchant's own primary and accent so a shop that changes its
 * palette changes these too.
 */
const TILE_BG = [
  "linear-gradient(135deg, var(--sf-primary), var(--sf-accent))",
  "linear-gradient(135deg, var(--sf-accent), color-mix(in srgb, var(--sf-primary) 55%, #000))",
  "linear-gradient(160deg, color-mix(in srgb, var(--sf-primary) 78%, #000), var(--sf-primary))",
];

function ShowcaseCard({ p, store, index }: { p: StorefrontProduct; store: SectionProps["store"]; index: number }) {
  const action = useCardAction();
  const act = action(p, { cart: "Get access", digital: "Get access", soldOut: "Sold out" });
  const flag = p.is_on_sale ? "Sale" : p.is_featured ? "Popular" : null;

  return (
    <article className="sf-sc-card">
      <div className="sf-sc-tile" style={{ background: TILE_BG[index % TILE_BG.length] }}>
        <span className="sf-sc-mark sf-d">{initials(p.name)}</span>
        {flag && <span className="sf-sc-flag">{flag}</span>}
      </div>
      <div className="sf-sc-cb">
        <p className="sf-sc-name">{p.name}</p>
        {p.short_description && <p className="sf-sc-desc">{p.short_description}</p>}
        <div className="sf-sc-foot">
          <span className="sf-sc-price">{formatPrice(store, p.base_price)}</span>
          {act.kind !== "none" && (
            <button className="sf-sc-get" disabled={act.disabled} onClick={act.run}>
              {act.kind === "enquire" ? <LuMail size={13} /> : <LuDownload size={13} />} {act.label}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function ShowcaseHero({ s, store }: SectionProps) {
  if (!s.enabled) return null;

  return (
    <section className="sf-sc-hero">
      <div className="sf-sc-hero-c">
        <span className="sf-sc-eyebrow"><LuSparkles size={13} /> {store.name}</span>
        <h1 className="sf-sc-h sf-d">{str(s.settings.title, `Welcome to ${store.name}`)}</h1>
        <p className="sf-sc-sub">{str(s.settings.subtitle, store.tagline || "Digital products, delivered the moment you buy.")}</p>
        <button className="sf-sc-cta">{str(s.settings.button_text, "Browse products")}</button>
        <div className="sf-sc-trust">
          <span><LuZap size={14} /> Instant delivery</span>
          <span><LuDownload size={14} /> Private download links</span>
          <span><LuSparkles size={14} /> Free updates</span>
        </div>
      </div>
    </section>
  );
}

function ShowcaseCatalog({ s, store }: SectionProps) {
  const { products } = useStorefront();
  const { active } = useFacet();
  if (!s.enabled) return null;
  const toShow = applyFacet(products || [], active);

  return (
    <section className="sf-sc-sec">
      <h2 className="sf-sc-sec-t sf-d">{str(s.settings.title, "All Products")}</h2>
      {toShow.length === 0
        ? <EmptyCatalog />
        : (
          <div className="sf-sc-grid">
            {toShow.map((p, i) => <ShowcaseCard key={p.id} p={p} store={store} index={i} />)}
          </div>
        )}
    </section>
  );
}

function ShowcaseFeatured({ s, store }: SectionProps) {
  const { products } = useStorefront();
  if (!s.enabled) return null;
  const all = products || [];
  const featured = all.filter(p => p.is_featured).slice(0, 3);
  const toShow = featured.length > 0 ? featured : all.slice(0, 3);
  if (toShow.length === 0) return null;

  return (
    <section className="sf-sc-sec">
      <h2 className="sf-sc-sec-t sf-d">{str(s.settings.title, "Most Popular")}</h2>
      <div className="sf-sc-grid">
        {toShow.map((p, i) => <ShowcaseCard key={p.id} p={p} store={store} index={i} />)}
      </div>
    </section>
  );
}

function ShowcaseCategories({ s }: SectionProps) {
  const { products } = useStorefront();
  const { active, setActive } = useFacet();
  if (!s.enabled) return null;
  const facets = deriveFacets(products || []);
  if (facets.length < 2) return null;

  return (
    <div className="sf-sc-sec" style={{ paddingBottom: 0 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {facets.map(f => (
          <button
            key={f.id}
            onClick={() => setActive(f.id)}
            style={{
              padding: "9px 18px",
              borderRadius: 9999,
              border: "1.5px solid",
              borderColor: active === f.id ? "var(--sf-primary)" : "rgba(0,0,0,0.1)",
              background: active === f.id ? "var(--sf-primary)" : "transparent",
              color: active === f.id ? "#fff" : "var(--sf-text)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            {f.label} <span style={{ opacity: .55 }}>({f.count})</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const showcase: LayoutModule = {
  styles,
  sections: {
    hero: ShowcaseHero,
    categories: ShowcaseCategories,
    catalog: ShowcaseCatalog,
    featured_products: ShowcaseFeatured,
  },
};

export default showcase;
