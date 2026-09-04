"use client";
/**
 * Technical — spec panels, sidebar filters.
 *
 * The electronics preset's shape: dense, square-cornered, information-first.
 * Cards carry spec lines rather than lifestyle photography, prices are set in
 * tabular figures so a column of them lines up, and the catalogue keeps a
 * persistent filter rail.
 *
 * This preset is also the only one that ships a dark background
 * (`background_color: #0f172a`). The base stylesheet hardcodes `#fff` card
 * surfaces and `rgba(0,0,0,…)` hairlines, which disappear or invert on a dark
 * page. Rather than change those shared values — every other layout depends on
 * them — this layout derives its own surfaces from the palette with
 * `color-mix`, so it reads correctly on a dark *and* a light background.
 */
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useStorefront } from "../../StorefrontProvider";
import type { StorefrontProduct } from "../../../types/storefront";
import type { LayoutModule } from "../registry";
import {
  EmptyCatalog,
  PinSaveButton,
  ProductMedia,
  SectionProps,
  applyFacet,
  deriveFacets,
  formatPrice,
  str,
  useCardAction,
  useFacet,
  useQuickViewTrigger,
} from "../shared";
import { LuCheck, LuCpu, LuDownload, LuMail, LuShoppingBag, LuX } from "react-icons/lu";

const styles = `
.sf-l-techgrid {
  /* Surfaces mixed out of the merchant's own palette, so they track the
     background whichever direction it goes. */
  --tg-surface: color-mix(in srgb, var(--sf-bg) 94%, var(--sf-text));
  --tg-raised: color-mix(in srgb, var(--sf-bg) 88%, var(--sf-text));
  --tg-line: color-mix(in srgb, var(--sf-bg) 80%, var(--sf-text));
  --tg-dim: color-mix(in srgb, var(--sf-bg) 42%, var(--sf-text));
}

/* Dark-safe corrections to shared chrome, scoped to this layout only. */
.sf-l-techgrid .sf-nav { border-bottom-color: var(--tg-line); }
.sf-l-techgrid .sf-search input { background: var(--tg-surface); border-color: var(--tg-line); color: var(--sf-text); }
.sf-l-techgrid .sf-btn:hover { background: var(--tg-surface); }
.sf-l-techgrid .sf-nl input { background: var(--tg-surface); border-color: var(--tg-line); color: var(--sf-text); }
.sf-l-techgrid .sf-footer { border-top-color: var(--tg-line); }
.sf-l-techgrid .sf-about-ph { background: var(--tg-surface); }
.sf-l-techgrid .sf-cat { border-radius: 0; }
.sf-l-techgrid .sf-cat:hover { background: var(--tg-surface); }
.sf-l-techgrid .sf-gh select { background: var(--tg-surface); border-color: var(--tg-line); color: var(--sf-text); border-radius: 0; }

/* Hero — hard edges, split, no scrim over type */
.sf-l-techgrid .sf-tg-hero { display: grid; grid-template-columns: 7fr 5fr; border-bottom: 1px solid var(--tg-line); }
.sf-l-techgrid .sf-tg-copy { padding: 72px clamp(24px, 4vw, 64px); display: flex; flex-direction: column; justify-content: center; }
.sf-l-techgrid .sf-tg-eyebrow { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--sf-primary); margin-bottom: 18px; }
.sf-l-techgrid .sf-tg-h { font-size: clamp(30px, 3.6vw, 48px); font-weight: 800; line-height: 1.08; letter-spacing: -.025em; margin-bottom: 16px; }
.sf-l-techgrid .sf-tg-sub { font-size: 16px; line-height: 1.65; color: var(--tg-dim); margin-bottom: 30px; max-width: 46ch; }
.sf-l-techgrid .sf-tg-cta { align-self: flex-start; padding: 14px 30px; background: var(--sf-primary); color: #fff; border: none; border-radius: 0; font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; transition: filter .2s; }
.sf-l-techgrid .sf-tg-cta:hover { filter: brightness(1.12); }
.sf-l-techgrid .sf-tg-img { position: relative; overflow: hidden; background: var(--tg-surface); min-height: 300px; }
.sf-l-techgrid .sf-tg-img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

/* Stat strip */
.sf-l-techgrid .sf-tg-stats { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid var(--tg-line); }
.sf-l-techgrid .sf-tg-stat { padding: 22px 24px; border-right: 1px solid var(--tg-line); }
.sf-l-techgrid .sf-tg-stat:last-child { border-right: none; }
.sf-l-techgrid .sf-tg-stat b { display: block; font-size: 13px; font-weight: 700; margin-bottom: 3px; }
.sf-l-techgrid .sf-tg-stat span { font-size: 12px; color: var(--tg-dim); }

/* Spec cards */
.sf-l-techgrid .sf-tg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1px; background: var(--tg-line); border: 1px solid var(--tg-line); }
.sf-l-techgrid .sf-tg-card { background: var(--sf-bg); display: flex; flex-direction: column; transition: background .15s; }
.sf-l-techgrid .sf-tg-card:hover { background: var(--tg-surface); }
.sf-l-techgrid .sf-tg-ci { position: relative; aspect-ratio: 4/3; background: var(--tg-surface); display: flex; align-items: center; justify-content: center; overflow: hidden; }
/* Contained and padded deliberately, and not from --sf-img-fit: a boxed
   gadget shot cropped to fill loses the product. Structural to this layout,
   the way the square corners are. */
.sf-l-techgrid .sf-tg-ci img { width: 100%; height: 100%; object-fit: contain; padding: 12px; }
.sf-l-techgrid .sf-tg-flag { position: absolute; top: 0; left: 0; padding: 4px 9px; background: var(--sf-primary); color: #fff; font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
.sf-l-techgrid .sf-tg-cb { padding: 14px; flex: 1; display: flex; flex-direction: column; }
.sf-l-techgrid .sf-tg-name { font-size: 14px; font-weight: 700; line-height: 1.35; margin-bottom: 10px; }
.sf-l-techgrid .sf-tg-specs { list-style: none; padding: 0; margin: 0 0 12px; display: flex; flex-direction: column; gap: 5px; }
.sf-l-techgrid .sf-tg-specs li { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--tg-dim); }
.sf-l-techgrid .sf-tg-price { margin-top: auto; font-size: 16px; font-weight: 800; color: var(--sf-primary); font-variant-numeric: tabular-nums; }
.sf-l-techgrid .sf-tg-add { width: 100%; padding: 11px; background: transparent; color: var(--sf-text); border: none; border-top: 1px solid var(--tg-line); font-family: inherit; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: background .15s, color .15s; }
.sf-l-techgrid .sf-tg-add:hover:not(:disabled) { background: var(--sf-primary); color: #fff; }
.sf-l-techgrid .sf-tg-add:disabled { color: var(--tg-dim); cursor: default; }

/* Catalogue frame */
.sf-l-techgrid .sf-tg-sec { max-width: 1440px; margin: 0 auto; padding: 48px 40px; }
.sf-l-techgrid .sf-tg-sec-t { font-size: 13px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--tg-dim); margin-bottom: 20px; }
.sf-l-techgrid .sf-tg-count { font-size: 12px; color: var(--tg-dim); font-variant-numeric: tabular-nums; }

@media (max-width: 900px) {
  .sf-l-techgrid .sf-tg-hero { grid-template-columns: 1fr; }
  .sf-l-techgrid .sf-tg-img { order: -1; min-height: 220px; }
  .sf-l-techgrid .sf-tg-copy { padding: 40px 20px; }
  .sf-l-techgrid .sf-tg-stats { grid-template-columns: 1fr; }
  .sf-l-techgrid .sf-tg-stat { border-right: none; border-bottom: 1px solid var(--tg-line); }
  .sf-l-techgrid .sf-tg-sec { padding: 32px 16px; }
  .sf-l-techgrid .sf-tg-grid { grid-template-columns: repeat(2, 1fr); }
}
`;

type Sort = "featured" | "price-asc" | "price-desc";

/**
 * The first spec line, which used to say "In stock" about everything.
 *
 * Stock is a fact about a warehouse. A download has no warehouse and a service
 * has no unit, so each states the true thing about itself instead.
 */
function AvailabilitySpec({ p }: { p: StorefrontProduct }) {
  if (p.product_type === "service") {
    return <li><LuMail size={12} /> Quoted per job</li>;
  }
  if (p.product_type === "digital") {
    const ready = (p.file_count ?? 0) > 0;
    return (
      <li>
        {ready ? <LuDownload size={12} /> : <LuX size={12} />}
        {ready ? "Instant download" : "Not yet available"}
      </li>
    );
  }
  return (
    <li>
      {p.in_stock ? <LuCheck size={12} /> : <LuX size={12} />}
      {p.in_stock ? "In stock" : "Out of stock"}
    </li>
  );
}

function TechCard({ p, store }: { p: StorefrontProduct; store: SectionProps["store"] }) {
  const action = useCardAction();
  const act = action(p, { cart: "Add", soldOut: "Unavailable", digital: "Buy" });
  const flag = p.is_on_sale ? "Sale" : p.is_featured ? "Pick" : null;
  const trigger = useQuickViewTrigger(p);

  return (
    <article className="sf-tg-card sf-card-tap" {...trigger}>
      <div className="sf-tg-ci">
        <ProductMedia product={p} placeholder={<LuCpu size={34} color="var(--tg-dim)" />} />
        {flag && <span className="sf-tg-flag">{flag}</span>}
        <PinSaveButton product={p} store={store} />
      </div>
      <div className="sf-tg-cb">
        <p className="sf-tg-name">{p.name}</p>
        <ul className="sf-tg-specs">
          <AvailabilitySpec p={p} />
          {p.short_description && <li>{p.short_description}</li>}
          {p.compare_at_price && p.is_on_sale && (
            <li style={{ textDecoration: "line-through" }}>{formatPrice(store, p.compare_at_price)}</li>
          )}
        </ul>
        <p className="sf-tg-price">{formatPrice(store, p.base_price)}</p>
      </div>
      {act.kind !== "none" && (
        <button className="sf-tg-add" disabled={act.disabled} onClick={act.run}>
          {act.kind === "enquire" ? <LuMail size={13} /> : <LuShoppingBag size={13} />} {act.label}
        </button>
      )}
    </article>
  );
}

function sortProducts(products: StorefrontProduct[], sort: Sort): StorefrontProduct[] {
  if (sort === "featured") return products;
  const price = (p: StorefrontProduct) => {
    const n = parseFloat(p.base_price);
    return Number.isFinite(n) ? n : 0;
  };
  return [...products].sort((a, b) => (sort === "price-asc" ? price(a) - price(b) : price(b) - price(a)));
}

function TechHero({ s, store }: SectionProps) {
  if (!s.enabled) return null;
  const image = str(s.settings.image);

  return (
    <>
      <section className="sf-tg-hero">
        <div className="sf-tg-copy">
          <span className="sf-tg-eyebrow"><LuCpu size={13} /> {store.name}</span>
          <h1 className="sf-tg-h sf-d">{str(s.settings.title, `Welcome to ${store.name}`)}</h1>
          <p className="sf-tg-sub">{str(s.settings.subtitle, store.tagline || "Specified, stocked and supported.")}</p>
          <Link href="/shop" className="sf-tg-cta">{str(s.settings.button_text, "Browse catalogue")}</Link>
        </div>
        <div className="sf-tg-img">
          {image
            ? <img src={image} alt="" />
            : <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, var(--sf-primary), var(--sf-accent))" }} />}
        </div>
      </section>
      <div className="sf-tg-stats">
        <div className="sf-tg-stat"><b>Genuine stock</b><span>Sourced and warranted</span></div>
        <div className="sf-tg-stat"><b>Nationwide delivery</b><span>Dispatched same day</span></div>
        <div className="sf-tg-stat"><b>After-sales support</b><span>Talk to a technician</span></div>
      </div>
    </>
  );
}

function TechCatalog({ s, store }: SectionProps) {
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
        <p className="sf-sidebar-t">Filter</p>
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
        <p className="sf-tg-count">{toShow.length} result{toShow.length === 1 ? "" : "s"}</p>
      </aside>

      <div className="sf-products">
        <div className="sf-gh">
          <h2 className="sf-tg-sec-t" style={{ margin: 0 }}>{str(s.settings.title, "Catalogue")}</h2>
          <select value={sort} onChange={e => setSort(e.target.value as Sort)}>
            <option value="featured">Featured</option>
            <option value="price-asc">Price: Low–High</option>
            <option value="price-desc">Price: High–Low</option>
          </select>
        </div>
        {toShow.length === 0
          ? <EmptyCatalog label={active === "all" ? "No products yet." : "Nothing matches this filter."} />
          : <div className="sf-tg-grid">{toShow.map(p => <TechCard key={p.id} p={p} store={store} />)}</div>}
      </div>
    </div>
  );
}

function TechFeatured({ s, store }: SectionProps) {
  const { products } = useStorefront();
  if (!s.enabled) return null;
  const all = products || [];
  const featured = all.filter(p => p.is_featured).slice(0, 5);
  const toShow = featured.length > 0 ? featured : all.slice(0, 5);
  if (toShow.length === 0) return null;

  return (
    <section className="sf-tg-sec">
      <h2 className="sf-tg-sec-t">{str(s.settings.title, "Featured Products")}</h2>
      <div className="sf-tg-grid">{toShow.map(p => <TechCard key={p.id} p={p} store={store} />)}</div>
    </section>
  );
}

const techgrid: LayoutModule = {
  styles,
  sections: {
    hero: TechHero,
    catalog: TechCatalog,
    featured_products: TechFeatured,
  },
};

export default techgrid;
