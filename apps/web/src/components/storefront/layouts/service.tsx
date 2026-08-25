"use client";
/**
 * Service — centred hero, offering list.
 *
 * The services preset's shape. A plumber or a studio is not selling objects
 * from a photo grid; each line is a piece of work with a scope and a starting
 * price. So the catalogue becomes a stack of divider-separated offerings —
 * title, what it covers, "from" price, one action — and the hero drops
 * photography for a centred statement on a soft wash of `--sf-secondary`.
 *
 * A service is quoted rather than priced, so its action goes to the shop's
 * enquiry form rather than the basket — the price on the row is the starting
 * point, not the total. A merchant who lists an ordinary product here still
 * gets a cart button; `useCardAction` decides per product, and only the
 * wording is this layout's business.
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
  requestEnquiry,
  str,
  useCardAction,
  useFacet,
} from "../shared";
import { LuArrowRight, LuCircleCheck, LuClock, LuPhone } from "react-icons/lu";

const styles = `
/* Hero — centred, no photograph */
.sf-l-service .sf-sv-hero { background: var(--sf-secondary); padding: 96px 40px 88px; text-align: center; border-bottom: 1px solid rgba(0,0,0,.06); }
.sf-l-service .sf-sv-hero-c { max-width: 740px; margin: 0 auto; }
.sf-l-service .sf-sv-eyebrow { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: var(--sf-primary); margin-bottom: 20px; }
.sf-l-service .sf-sv-h { font-size: clamp(32px, 4.4vw, 54px); font-weight: 800; line-height: 1.08; letter-spacing: -.025em; margin-bottom: 18px; }
.sf-l-service .sf-sv-sub { font-size: 17px; line-height: 1.7; opacity: .7; margin-bottom: 32px; }
.sf-l-service .sf-sv-acts { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
.sf-l-service .sf-sv-cta { padding: 15px 32px; background: var(--sf-primary); color: #fff; border: none; border-radius: var(--sf-r, 10px); font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; transition: filter .2s, transform .2s; text-decoration: none; display: inline-flex; align-items: center; }
.sf-l-service .sf-sv-cta:hover { filter: brightness(1.08); transform: translateY(-2px); }
.sf-l-service .sf-sv-cta2 { padding: 15px 28px; background: transparent; color: var(--sf-text); border: 1.5px solid rgba(0,0,0,.15); border-radius: var(--sf-r, 10px); font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; }
.sf-l-service .sf-sv-cta2:hover { border-color: var(--sf-primary); color: var(--sf-primary); }
.sf-l-service .sf-sv-assure { display: flex; justify-content: center; gap: 24px; flex-wrap: wrap; margin-top: 30px; font-size: 13px; opacity: .62; }
.sf-l-service .sf-sv-assure span { display: inline-flex; align-items: center; gap: 6px; }

/* Offering list */
.sf-l-service .sf-sv-sec { max-width: 980px; margin: 0 auto; padding: 76px 40px; }
.sf-l-service .sf-sv-sec-h { text-align: center; margin-bottom: 44px; }
.sf-l-service .sf-sv-sec-h h2 { font-size: clamp(26px, 3vw, 36px); font-weight: 800; letter-spacing: -.02em; margin-bottom: 10px; }
.sf-l-service .sf-sv-sec-h p { font-size: 15px; opacity: .62; }
.sf-l-service .sf-sv-row { display: flex; align-items: center; gap: 28px; padding: 26px 0; border-top: 1px solid rgba(0,0,0,.08); }
.sf-l-service .sf-sv-row:last-child { border-bottom: 1px solid rgba(0,0,0,.08); }
.sf-l-service .sf-sv-body { flex: 1; min-width: 0; }
.sf-l-service .sf-sv-name { font-size: 19px; font-weight: 700; letter-spacing: -.01em; margin-bottom: 6px; }
.sf-l-service .sf-sv-desc { font-size: 14.5px; line-height: 1.6; opacity: .65; max-width: 60ch; }
.sf-l-service .sf-sv-tag { display: inline-block; margin-top: 10px; padding: 3px 10px; border-radius: 9999px; background: color-mix(in srgb, var(--sf-primary) 12%, transparent); color: var(--sf-primary); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.sf-l-service .sf-sv-right { flex-shrink: 0; text-align: right; }
.sf-l-service .sf-sv-from { display: block; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; opacity: .5; margin-bottom: 3px; }
.sf-l-service .sf-sv-price { display: block; font-size: 21px; font-weight: 800; color: var(--sf-primary); margin-bottom: 12px; white-space: nowrap; }
.sf-l-service .sf-sv-book { padding: 10px 20px; background: transparent; color: var(--sf-primary); border: 1.5px solid var(--sf-primary); border-radius: var(--sf-r, 10px); font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; transition: background .15s, color .15s; }
.sf-l-service .sf-sv-book:hover:not(:disabled) { background: var(--sf-primary); color: #fff; }
.sf-l-service .sf-sv-book:disabled { border-color: rgba(0,0,0,.15); color: var(--sf-text); opacity: .45; cursor: default; }

/* Highlighted offerings */
.sf-l-service .sf-sv-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; }
.sf-l-service .sf-sv-card { padding: 28px 24px; border: 1.5px solid rgba(0,0,0,.09); border-radius: var(--sf-card-r, 14px); display: flex; flex-direction: column; transition: border-color .2s, transform .2s, box-shadow .2s; }
.sf-l-service .sf-sv-card:hover { border-color: var(--sf-primary); transform: translateY(-3px); box-shadow: 0 12px 30px rgba(0,0,0,.07); }
.sf-l-service .sf-sv-card h3 { font-size: 17px; font-weight: 700; margin-bottom: 8px; }
.sf-l-service .sf-sv-card p { font-size: 14px; line-height: 1.6; opacity: .65; margin-bottom: 18px; }
.sf-l-service .sf-sv-card-p { margin-top: auto; font-size: 20px; font-weight: 800; color: var(--sf-primary); margin-bottom: 14px; }

/* Centred tabs */
.sf-l-service .sf-sv-tabs { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; padding: 56px 40px 0; }
.sf-l-service .sf-sv-tab { padding: 9px 20px; border-radius: 9999px; border: 1.5px solid rgba(0,0,0,.12); background: transparent; color: var(--sf-text); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
.sf-l-service .sf-sv-tab.active { background: var(--sf-primary); border-color: var(--sf-primary); color: #fff; }

@media (max-width: 900px) {
  .sf-l-service .sf-sv-hero { padding: 60px 20px 52px; }
  .sf-l-service .sf-sv-sec { padding: 48px 20px; }
  .sf-l-service .sf-sv-row { flex-direction: column; align-items: flex-start; gap: 16px; }
  .sf-l-service .sf-sv-right { text-align: left; }
  .sf-l-service .sf-sv-assure { gap: 14px; }
  .sf-l-service .sf-sv-tabs { padding: 36px 20px 0; }
}
`;

const BOOKING = { cart: "Book this", soldOut: "Unavailable", enquire: "Get a quote" };

function OfferingRow({ p, store }: { p: StorefrontProduct; store: SectionProps["store"] }) {
  const action = useCardAction();
  const act = action(p, BOOKING);

  return (
    <div className="sf-sv-row">
      <div className="sf-sv-body">
        <p className="sf-sv-name sf-d">{p.name}</p>
        {p.short_description && <p className="sf-sv-desc">{p.short_description}</p>}
        {p.is_featured && <span className="sf-sv-tag">Most requested</span>}
      </div>
      <div className="sf-sv-right">
        <span className="sf-sv-from">From</span>
        <span className="sf-sv-price">{formatPrice(store, p.base_price)}</span>
        {act.kind !== "none" && (
          <button className="sf-sv-book" disabled={act.disabled} onClick={act.run}>
            {act.label} {!act.disabled && <LuArrowRight size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

function ServiceHero({ s, store }: SectionProps) {
  if (!s.enabled) return null;

  // The hero button used to be inert. Where the merchant has given it a
  // destination it is a link; where they have not, the thing a service site's
  // hero button is for is asking, so it goes to the enquiry form.
  const url = str(s.settings.button_url);
  const label = str(s.settings.button_text, "Request a quote");

  return (
    <section className="sf-sv-hero">
      <div className="sf-sv-hero-c">
        <span className="sf-sv-eyebrow">{store.name}</span>
        <h1 className="sf-sv-h sf-d">{str(s.settings.title, `Welcome to ${store.name}`)}</h1>
        <p className="sf-sv-sub">{str(s.settings.subtitle, store.tagline || "Professional work, done properly, on time.")}</p>
        <div className="sf-sv-acts">
          {url
            ? <a className="sf-sv-cta" href={url}>{label}</a>
            : <button className="sf-sv-cta" onClick={() => requestEnquiry()}>{label}</button>}
          {store.phone && (
            <a href={`tel:${store.phone}`} className="sf-sv-cta2"><LuPhone size={15} /> {store.phone}</a>
          )}
        </div>
        <div className="sf-sv-assure">
          <span><LuCircleCheck size={14} /> Fixed quotes up front</span>
          <span><LuClock size={14} /> Same-week availability</span>
          <span><LuCircleCheck size={14} /> Work guaranteed</span>
        </div>
      </div>
    </section>
  );
}

function ServiceCatalog({ s, store }: SectionProps) {
  const { products } = useStorefront();
  const { active } = useFacet();
  if (!s.enabled) return null;
  const toShow = applyFacet(products || [], active);

  return (
    <section className="sf-sv-sec">
      <header className="sf-sv-sec-h">
        <h2 className="sf-d">{str(s.settings.title, "What We Offer")}</h2>
        <p>Every price below is a starting point — tell us the detail and we will confirm.</p>
      </header>
      {toShow.length === 0
        ? <EmptyCatalog label="No services listed yet." />
        : <div>{toShow.map(p => <OfferingRow key={p.id} p={p} store={store} />)}</div>}
    </section>
  );
}

function ServiceFeatured({ s, store }: SectionProps) {
  const { products } = useStorefront();
  const action = useCardAction();
  if (!s.enabled) return null;

  const all = products || [];
  const featured = all.filter(p => p.is_featured).slice(0, 3);
  const toShow = featured.length > 0 ? featured : all.slice(0, 3);
  if (toShow.length === 0) return null;

  return (
    <section className="sf-sv-sec">
      <header className="sf-sv-sec-h">
        <h2 className="sf-d">{str(s.settings.title, "Popular Services")}</h2>
      </header>
      <div className="sf-sv-cards">
        {toShow.map(p => {
          const act = action(p, BOOKING);
          return (
            <article key={p.id} className="sf-sv-card">
              <h3 className="sf-d">{p.name}</h3>
              {p.short_description && <p>{p.short_description}</p>}
              <p className="sf-sv-card-p">{formatPrice(store, p.base_price)}</p>
              {act.kind !== "none" && (
                <button className="sf-sv-book" disabled={act.disabled} onClick={act.run}>
                  {act.label} {!act.disabled && <LuArrowRight size={14} />}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ServiceCategories({ s }: SectionProps) {
  const { products } = useStorefront();
  const { active, setActive } = useFacet();
  if (!s.enabled) return null;
  const facets = deriveFacets(products || []);
  if (facets.length < 2) return null;

  return (
    <nav className="sf-sv-tabs">
      {facets.map(f => (
        <button
          key={f.id}
          className={`sf-sv-tab${active === f.id ? " active" : ""}`}
          onClick={() => setActive(f.id)}
        >
          {f.label}
        </button>
      ))}
    </nav>
  );
}

const service: LayoutModule = {
  styles,
  sections: {
    hero: ServiceHero,
    categories: ServiceCategories,
    catalog: ServiceCatalog,
    featured_products: ServiceFeatured,
  },
};

export default service;
