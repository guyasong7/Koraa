"use client";
/**
 * Editorial — a full-bleed lookbook.
 *
 * The fashion preset's shape. The classic hero puts a left-to-right scrim over
 * a 480px band; here the image runs nearly the full viewport with the caption
 * sitting on a bottom scrim, and the catalogue drops card chrome entirely:
 * two large portrait tiles per row, name and price set as plain type beneath,
 * cart action revealed on hover as a rule rather than a filled bar.
 */
import React from "react";
import { useStorefront } from "../../StorefrontProvider";
import type { StorefrontProduct } from "../../../types/storefront";
import type { LayoutModule } from "../registry";
import {
  EmptyCatalog,
  PinSaveButton,
  ProductMedia,
  SectionProps,
  applyFacet,
  bool,
  deriveFacets,
  formatPrice,
  str,
  useCardAction,
  useFacet,
} from "../shared";

const styles = `
.sf-l-editorial .sf-ed-hero { position: relative; height: min(88vh, 760px); display: flex; align-items: flex-end; overflow: hidden; }
.sf-l-editorial .sf-ed-hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.sf-l-editorial .sf-ed-scrim { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,.66) 0%, rgba(0,0,0,.16) 46%, transparent 76%); }
.sf-l-editorial .sf-ed-cap { position: relative; z-index: 1; max-width: 1440px; margin: 0 auto; width: 100%; padding: 0 64px 76px; }
.sf-l-editorial .sf-ed-eyebrow { display: block; font-size: 11px; font-weight: 700; letter-spacing: .28em; text-transform: uppercase; color: rgba(255,255,255,.82); margin-bottom: 18px; }
.sf-l-editorial .sf-ed-h { font-size: clamp(44px, 7vw, 92px); line-height: .98; font-weight: 800; color: #fff; letter-spacing: -.03em; max-width: 15ch; }
.sf-l-editorial .sf-ed-sub { color: rgba(255,255,255,.8); font-size: 16px; line-height: 1.6; max-width: 40ch; margin-top: 20px; }
.sf-l-editorial .sf-ed-cta { display: inline-block; margin-top: 30px; padding: 0 0 5px; background: none; border: none; border-bottom: 1.5px solid rgba(255,255,255,.55); color: #fff; font-family: inherit; font-size: 12px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; cursor: pointer; transition: border-color .2s; }
.sf-l-editorial .sf-ed-cta:hover { border-bottom-color: #fff; }

/* Section framing — centred, letterspaced, generous */
.sf-l-editorial .sf-ed-sec { max-width: 1440px; margin: 0 auto; padding: 96px 64px; }
.sf-l-editorial .sf-ed-sec-h { text-align: center; margin-bottom: 56px; }
.sf-l-editorial .sf-ed-sec-h span { display: block; font-size: 11px; font-weight: 700; letter-spacing: .28em; text-transform: uppercase; opacity: .45; margin-bottom: 14px; }
.sf-l-editorial .sf-ed-sec-h h2 { font-size: clamp(24px, 2.6vw, 34px); font-weight: 800; letter-spacing: -.02em; }

/* Lookbook grid */
.sf-l-editorial .sf-ed-look { display: grid; grid-template-columns: repeat(2, 1fr); gap: 60px 40px; }
.sf-l-editorial .sf-ed-tile { cursor: pointer; }
.sf-l-editorial .sf-ed-tile-i { position: relative; aspect-ratio: 3/4; overflow: hidden; background: rgba(0,0,0,.04); display: flex; align-items: center; justify-content: center; }
.sf-l-editorial .sf-ed-tile-i img { width: 100%; height: 100%; object-fit: var(--sf-img-fit, cover); transition: transform .7s cubic-bezier(.2,.8,.2,1); }
.sf-l-editorial .sf-ed-tile:hover .sf-ed-tile-i img { transform: scale(1.04); }
.sf-l-editorial .sf-ed-tag { position: absolute; top: 16px; left: 16px; padding: 5px 11px; background: var(--sf-bg); color: var(--sf-text); font-size: 10px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; }
.sf-l-editorial .sf-ed-meta { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-top: 18px; }
.sf-l-editorial .sf-ed-name { font-size: 15px; font-weight: 600; }
.sf-l-editorial .sf-ed-price { font-size: 15px; opacity: .7; white-space: nowrap; }
.sf-l-editorial .sf-ed-add { margin-top: 10px; padding: 0 0 2px; background: none; border: none; border-bottom: 1.5px solid var(--sf-text); color: var(--sf-text); font-family: inherit; font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; cursor: pointer; opacity: 0; transform: translateY(-3px); transition: opacity .25s, transform .25s; }
.sf-l-editorial .sf-ed-tile:hover .sf-ed-add { opacity: 1; transform: none; }
.sf-l-editorial .sf-ed-add:disabled { border-bottom-color: transparent; opacity: .45; cursor: default; }

/* Categories as text links */
.sf-l-editorial .sf-ed-cats { display: flex; justify-content: center; flex-wrap: wrap; gap: 36px; padding: 52px 64px 0; }
.sf-l-editorial .sf-ed-cat { padding: 0 0 6px; background: none; border: none; border-bottom: 1.5px solid transparent; color: var(--sf-text); font-family: inherit; font-size: 11px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; cursor: pointer; opacity: .5; transition: opacity .2s, border-color .2s; }
.sf-l-editorial .sf-ed-cat:hover { opacity: 1; }
.sf-l-editorial .sf-ed-cat.active { opacity: 1; border-bottom-color: var(--sf-text); }

/* About — asymmetric 5/7 */
.sf-l-editorial .sf-ed-about { max-width: 1440px; margin: 0 auto; padding: 96px 64px; display: grid; grid-template-columns: 5fr 7fr; gap: 72px; align-items: center; }
.sf-l-editorial .sf-ed-about h2 { font-size: clamp(28px, 3.4vw, 46px); font-weight: 800; letter-spacing: -.025em; line-height: 1.08; margin-bottom: 22px; }
.sf-l-editorial .sf-ed-about p { font-size: 17px; line-height: 1.75; opacity: .72; }
.sf-l-editorial .sf-ed-about img, .sf-l-editorial .sf-ed-about-ph { width: 100%; aspect-ratio: 4/5; object-fit: cover; background: rgba(0,0,0,.05); }

@media (max-width: 900px) {
  .sf-l-editorial .sf-ed-hero { height: min(72vh, 520px); }
  .sf-l-editorial .sf-ed-cap { padding: 0 20px 44px; }
  .sf-l-editorial .sf-ed-sec, .sf-l-editorial .sf-ed-about { padding: 56px 20px; }
  .sf-l-editorial .sf-ed-sec-h { margin-bottom: 34px; }
  .sf-l-editorial .sf-ed-look { grid-template-columns: 1fr; gap: 40px; }
  .sf-l-editorial .sf-ed-about { grid-template-columns: 1fr; gap: 32px; }
  .sf-l-editorial .sf-ed-cats { gap: 22px; padding: 32px 20px 0; }
  /* No hover on touch, so the cart action has to be visible outright. */
  .sf-l-editorial .sf-ed-add { opacity: 1; transform: none; }
}
`;

function LookTile({ p, store }: { p: StorefrontProduct; store: SectionProps["store"] }) {
  const action = useCardAction();
  const act = action(p, { cart: "Add to bag", soldOut: "Sold out", digital: "Buy & download" });
  const tag = p.is_on_sale ? "Sale" : p.is_featured ? "Featured" : null;

  return (
    <article className="sf-ed-tile">
      <div className="sf-ed-tile-i">
        <ProductMedia
          product={p}
          placeholder={
            <span style={{ fontSize: 12, letterSpacing: ".2em", textTransform: "uppercase", opacity: .35 }}>No image</span>
          }
        />
        {tag && <span className="sf-ed-tag">{tag}</span>}
        <PinSaveButton product={p} store={store} />
      </div>
      <div className="sf-ed-meta">
        <span className="sf-ed-name">{p.name}</span>
        <span className="sf-ed-price">{formatPrice(store, p.base_price)}</span>
      </div>
      {act.kind !== "none" && (
        <button className="sf-ed-add" disabled={act.disabled} onClick={act.run}>
          {act.label}
        </button>
      )}
    </article>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="sf-ed-sec-h">
      <span>{eyebrow}</span>
      <h2 className="sf-d">{title}</h2>
    </header>
  );
}

function EditorialHero({ s, store }: SectionProps) {
  if (!s.enabled) return null;
  const image = str(s.settings.image);

  return (
    <section className="sf-ed-hero">
      {image
        ? <img src={image} alt="" className="sf-ed-hero-img" />
        : <div className="sf-ed-hero-img" style={{ background: "linear-gradient(135deg, var(--sf-primary), var(--sf-accent))" }} />}
      {bool(s.settings.overlay, true) && <div className="sf-ed-scrim" />}
      <div className="sf-ed-cap">
        <span className="sf-ed-eyebrow">{store.name}</span>
        <h1 className="sf-ed-h sf-d">{str(s.settings.title, `Welcome to ${store.name}`)}</h1>
        <p className="sf-ed-sub">{str(s.settings.subtitle, store.tagline || "Discover our premium collection.")}</p>
        <button className="sf-ed-cta">{str(s.settings.button_text, "Shop the collection")}</button>
      </div>
    </section>
  );
}

function EditorialCategories({ s }: SectionProps) {
  const { products } = useStorefront();
  const { active, setActive } = useFacet();
  if (!s.enabled) return null;
  const facets = deriveFacets(products || []);
  if (facets.length < 2) return null;

  return (
    <nav className="sf-ed-cats">
      {facets.map(f => (
        <button
          key={f.id}
          className={`sf-ed-cat${active === f.id ? " active" : ""}`}
          onClick={() => setActive(f.id)}
        >
          {f.label}
        </button>
      ))}
    </nav>
  );
}

function EditorialCatalog({ s, store }: SectionProps) {
  const { products } = useStorefront();
  const { active } = useFacet();
  if (!s.enabled) return null;
  const toShow = applyFacet(products || [], active);

  return (
    <section className="sf-ed-sec">
      <SectionHead eyebrow="The collection" title={str(s.settings.title, "Our Collection")} />
      {toShow.length === 0
        ? <EmptyCatalog />
        : <div className="sf-ed-look">{toShow.map(p => <LookTile key={p.id} p={p} store={store} />)}</div>}
    </section>
  );
}

function EditorialFeatured({ s, store }: SectionProps) {
  const { products } = useStorefront();
  if (!s.enabled) return null;
  const all = products || [];
  const featured = all.filter(p => p.is_featured).slice(0, 4);
  const toShow = featured.length > 0 ? featured : all.slice(0, 4);
  if (toShow.length === 0) return null;

  return (
    <section className="sf-ed-sec">
      <SectionHead eyebrow="This season" title={str(s.settings.title, "Featured Products")} />
      <div className="sf-ed-look">{toShow.map(p => <LookTile key={p.id} p={p} store={store} />)}</div>
    </section>
  );
}

function EditorialAbout({ s }: SectionProps) {
  if (!s.enabled) return null;
  const image = str(s.settings.image);

  return (
    <section className="sf-ed-about">
      <div>
        <h2 className="sf-d">{str(s.settings.title, "Our Story")}</h2>
        <p>{str(s.settings.content, "We believe in quality products and exceptional service.")}</p>
      </div>
      {image ? <img src={image} alt="" /> : <div className="sf-ed-about-ph" />}
    </section>
  );
}

const editorial: LayoutModule = {
  styles,
  sections: {
    hero: EditorialHero,
    categories: EditorialCategories,
    catalog: EditorialCatalog,
    featured_products: EditorialFeatured,
    about: EditorialAbout,
  },
};

export default editorial;
