"use client";
/**
 * Boutique — split hero, filtered catalogue.
 *
 * The beauty preset's shape. Two departures from classic:
 *
 * 1. The hero stops being a photograph with text burned over it and becomes a
 *    50/50 split — copy on a `--sf-secondary` panel, image alongside — so the
 *    headline sits on a flat colour and stays legible whatever the photo is.
 *
 * 2. The catalogue finally renders a sidebar. `.sf-sidebar`, `.sf-cats` and
 *    `.sf-cat` have been in the base stylesheet all along, including their
 *    responsive collapse, but `Catalog` only ever rendered `.sf-products` — so
 *    that CSS was dead. This layout uses it as intended, and wires the
 *    previously inert sort control up as well.
 */
import React, { useMemo, useState } from "react";
import { useStorefront } from "../../StorefrontProvider";
import type { StorefrontProduct } from "../../../types/storefront";
import type { LayoutModule } from "../registry";
import {
  EmptyCatalog,
  ProductCard,
  SectionProps,
  applyFacet,
  deriveFacets,
  str,
  useFacet,
} from "../shared";

const styles = `
.sf-l-boutique .sf-bq-hero { display: grid; grid-template-columns: 1fr 1fr; min-height: 540px; }
.sf-l-boutique .sf-bq-copy { background: var(--sf-secondary); display: flex; flex-direction: column; justify-content: center; padding: 72px clamp(32px, 5vw, 88px); }
.sf-l-boutique .sf-bq-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: var(--sf-primary); margin-bottom: 18px; }
.sf-l-boutique .sf-bq-h { font-size: clamp(32px, 3.6vw, 50px); font-weight: 800; line-height: 1.08; letter-spacing: -.02em; margin-bottom: 18px; }
.sf-l-boutique .sf-bq-sub { font-size: 16px; line-height: 1.7; opacity: .72; margin-bottom: 32px; max-width: 42ch; }
.sf-l-boutique .sf-bq-cta { align-self: flex-start; padding: 14px 34px; background: var(--sf-primary); color: #fff; border: none; border-radius: var(--sf-r, 10px); font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; transition: filter .2s, transform .2s; }
.sf-l-boutique .sf-bq-cta:hover { filter: brightness(1.08); transform: translateY(-2px); }
.sf-l-boutique .sf-bq-img { position: relative; overflow: hidden; min-height: 320px; background: rgba(0,0,0,.04); }
.sf-l-boutique .sf-bq-img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

/* Sidebar extras on top of the reused base classes */
.sf-l-boutique .sf-bq-count { font-size: 12px; opacity: .5; margin-bottom: 18px; }
.sf-l-boutique .sf-bq-reset { padding: 0; background: none; border: none; border-bottom: 1px solid currentColor; color: var(--sf-primary); font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }

@media (max-width: 900px) {
  .sf-l-boutique .sf-bq-hero { grid-template-columns: 1fr; min-height: 0; }
  /* Image first on a narrow screen — a full-width colour panel with no
     picture above it reads as a broken page. */
  .sf-l-boutique .sf-bq-img { order: -1; min-height: 260px; }
  .sf-l-boutique .sf-bq-copy { padding: 40px 20px; }
}
`;

type Sort = "featured" | "price-asc" | "price-desc";

function sortProducts(products: StorefrontProduct[], sort: Sort): StorefrontProduct[] {
  if (sort === "featured") return products;
  const price = (p: StorefrontProduct) => {
    const n = parseFloat(p.base_price);
    return Number.isFinite(n) ? n : 0;
  };
  return [...products].sort((a, b) => (sort === "price-asc" ? price(a) - price(b) : price(b) - price(a)));
}

function BoutiqueHero({ s, store }: SectionProps) {
  if (!s.enabled) return null;
  const image = str(s.settings.image);

  return (
    <section className="sf-bq-hero">
      <div className="sf-bq-copy">
        <span className="sf-bq-eyebrow">{store.name}</span>
        <h1 className="sf-bq-h sf-d">{str(s.settings.title, `Welcome to ${store.name}`)}</h1>
        <p className="sf-bq-sub">{str(s.settings.subtitle, store.tagline || "Discover our premium collection.")}</p>
        <button className="sf-bq-cta">{str(s.settings.button_text, "Shop Now")} →</button>
      </div>
      <div className="sf-bq-img">
        {image
          ? <img src={image} alt="" />
          : <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, var(--sf-primary), var(--sf-accent))" }} />}
      </div>
    </section>
  );
}

function BoutiqueCatalog({ s, store }: SectionProps) {
  const { products } = useStorefront();
  const { active, setActive } = useFacet();
  const [sort, setSort] = useState<Sort>("featured");
  const all = products || [];
  const facets = deriveFacets(all);
  const toShow = useMemo(() => sortProducts(applyFacet(all, active), sort), [all, active, sort]);

  if (!s.enabled) return null;

  return (
    <div className="sf-catalog">
      <aside className="sf-sidebar">
        <p className="sf-sidebar-t">Browse</p>
        <ul className="sf-cats">
          {facets.map(f => (
            <li
              key={f.id}
              className={`sf-cat${active === f.id ? " active" : ""}`}
              onClick={() => setActive(f.id)}
            >
              <span>{f.label}</span>
              <span style={{ opacity: .6, fontSize: 12 }}>{f.count}</span>
            </li>
          ))}
        </ul>
        {active !== "all" && (
          <button className="sf-bq-reset" onClick={() => setActive("all")}>Clear filter</button>
        )}
      </aside>

      <div className="sf-products">
        <div className="sf-gh">
          <h2 className="sf-d">{str(s.settings.title, "Our Collection")}</h2>
          <select value={sort} onChange={e => setSort(e.target.value as Sort)}>
            <option value="featured">Featured</option>
            <option value="price-asc">Price: Low–High</option>
            <option value="price-desc">Price: High–Low</option>
          </select>
        </div>
        <p className="sf-bq-count">{toShow.length} {toShow.length === 1 ? "product" : "products"}</p>
        {toShow.length === 0
          ? <EmptyCatalog label={active === "all" ? "No products yet." : "Nothing in this filter yet."} />
          : <div className="sf-grid">{toShow.map(p => <ProductCard key={p.id} p={p} store={store} />)}</div>}
      </div>
    </div>
  );
}

const boutique: LayoutModule = {
  styles,
  sections: {
    hero: BoutiqueHero,
    catalog: BoutiqueCatalog,
  },
};

export default boutique;
