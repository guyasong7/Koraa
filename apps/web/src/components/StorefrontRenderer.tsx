"use client";
import React from "react";
import { useStorefront } from "./StorefrontProvider";
import { LuGlobe, LuMenu, LuSearch, LuShoppingBag, LuUsers } from "react-icons/lu";
import { useCartStore } from "../stores/cart";
import { usePageView } from "../lib/analytics";
import Link from "next/link";
import { EmptyCatalog, FacetProvider, ProductCard, linkList, str } from "./storefront/shared";
import type { FooterProps, NavbarProps } from "./storefront/shared";
import { resolveLayout, resolveLayoutKey } from "./storefront/registry";
import ContactForm from "./storefront/ContactForm";
import { CookieBanner } from "./storefront/CookieBanner";
import { useSiteSettings } from "./storefront/siteSettings";
import { STOREFRONT_DEFAULTS } from "./storefront/theme";

const STYLES = `
.sf * { box-sizing: border-box; margin: 0; }
.sf { font-family: var(--sf-font, Inter), sans-serif; color: var(--sf-text); background: var(--sf-bg); min-height: 100vh; }
.sf-d { font-family: var(--sf-heading-font, Outfit), sans-serif; letter-spacing: -0.02em; }

/* Every text field, select and button in a storefront resolves its corner
   from --sf-r, which the merchant's button_style sets (square 0, pill
   9999px, else 10px). Two of them used to name their own radius — the nav
   search was a hard 9999px and the sort select a hard 8px — so a merchant
   on the square kit got pill and round-cornered controls next to square
   buttons. Do not hardcode a radius on a control here; a layout that wants
   a different corner overrides --sf-r or the rule, as techgrid does. */

/* NAV */
.sf-nav { position: sticky; top: 0; z-index: 100; background: var(--sf-bg); border-bottom: 1px solid rgba(0,0,0,0.07); backdrop-filter: blur(12px); }
.sf-nav-i { max-width: 1440px; margin: 0 auto; padding: 0 40px; height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.sf-logo { font-size: 22px; font-weight: 800; color: var(--sf-text); text-decoration: none; }
.sf-links { display: flex; gap: 24px; }
.sf-link { color: var(--sf-text); text-decoration: none; font-size: 14px; font-weight: 500; opacity: 0.7; transition: opacity .15s; }
.sf-link:hover { opacity: 1; }
.sf-actions { display: flex; align-items: center; gap: 6px; }
.sf-btn { background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px; color: var(--sf-text); display: flex; align-items: center; transition: background .15s; }
.sf-btn:hover { background: rgba(0,0,0,0.05); }
.sf-lang { background: none; border: none; font-weight: 600; font-size: 13px; color: var(--sf-text); cursor: pointer; outline: none; }
.sf-badge { position: absolute; top: 2px; right: 2px; background: var(--sf-primary); color: #fff; font-size: 10px; font-weight: 700; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.sf-search { flex: 1; max-width: 320px; position: relative; }
.sf-search input { width: 100%; padding: 9px 16px 9px 36px; border-radius: var(--sf-r,10px); border: 1.5px solid rgba(0,0,0,0.1); font-size: 14px; background: rgba(0,0,0,0.03); outline: none; font-family: inherit; }
.sf-search input:focus { border-color: var(--sf-primary); }
.sf-si { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: #999; }

/* ANNOUNCEMENT */
.sf-ann { background: var(--sf-primary); color: #fff; padding: 9px 16px; text-align: center; font-size: 13px; font-weight: 500; }

/* HERO */
.sf-hero { position: relative; width: 100%; height: 480px; overflow: hidden; display: flex; align-items: center; }
.sf-hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.sf-hero-ov { position: absolute; inset: 0; background: linear-gradient(to right, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.25) 60%, transparent 100%); }
.sf-hero-c { position: relative; z-index: 1; max-width: 1440px; margin: 0 auto; padding: 0 64px; width: 100%; }
.sf-hero-tag { display: inline-block; padding: 4px 14px; background: var(--sf-primary); color: #fff; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; border-radius: 9999px; margin-bottom: 18px; }
.sf-hero-h { font-size: clamp(34px,4.5vw,54px); font-weight: 800; color: #fff; line-height: 1.1; margin-bottom: 14px; max-width: 520px; }
.sf-hero-p { color: rgba(255,255,255,.85); font-size: 16px; line-height: 1.65; margin-bottom: 32px; max-width: 440px; }
.sf-hero-btn { display: inline-flex; align-items: center; gap: 8px; background: var(--sf-primary); color: #fff; font-weight: 700; font-size: 15px; padding: 13px 30px; border-radius: var(--sf-r,10px); border: none; cursor: pointer; transition: filter .2s, transform .2s; }
.sf-hero-btn:hover { filter: brightness(1.1); transform: translateY(-2px); }

/* CATALOG */
.sf-catalog { max-width: 1440px; margin: 0 auto; padding: 40px; display: flex; gap: 32px; align-items: flex-start; }
.sf-sidebar { width: 230px; flex-shrink: 0; position: sticky; top: 88px; }
.sf-sidebar-t { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--sf-text); opacity: .45; margin: 0 0 10px; }
.sf-cats { list-style: none; padding: 0; margin: 0 0 28px; display: flex; flex-direction: column; gap: 2px; }
.sf-cat { padding: 10px 12px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all .15s; color: var(--sf-text); opacity: .7; display: flex; align-items: center; justify-content: space-between; }
.sf-cat:hover { opacity: 1; background: rgba(0,0,0,0.04); }
.sf-cat.active { background: var(--sf-primary); color: #fff; opacity: 1; font-weight: 600; }
.sf-products { flex: 1; min-width: 0; }
.sf-gh { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
.sf-gh h2 { font-size: 18px; font-weight: 700; }
.sf-gh select { padding: 7px 12px; border: 1.5px solid rgba(0,0,0,0.1); border-radius: var(--sf-r,10px); font-size: 13px; background: transparent; color: var(--sf-text); cursor: pointer; outline: none; font-family: inherit; }
.sf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--sf-card-w, 210px),1fr)); gap: var(--sf-card-gap, 18px); }

/* CARD */
.sf-card { background: #fff; border-radius: var(--sf-card-r, 14px); overflow: hidden; border: 1px solid rgba(0,0,0,0.07); transition: box-shadow .2s, transform .2s; cursor: pointer; }
.sf-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,0.1); transform: translateY(-3px); }
.sf-ci { position: relative; aspect-ratio: var(--sf-card-ar, 1/1); background: rgba(0,0,0,0.04); overflow: hidden; display: flex; align-items: center; justify-content: center; }
.sf-ci img { width: 100%; height: 100%; object-fit: var(--sf-img-fit, cover); transition: transform .3s; }
.sf-card:hover .sf-ci img { transform: scale(1.04); }
.sf-wl { position: absolute; top: 9px; right: 9px; width: 30px; height: 30px; background: #fff; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,.12); opacity: 0; transition: opacity .2s; }
.sf-card:hover .sf-wl { opacity: 1; }
/* Pinterest save, from the Pinterest Save Buttons panel. Sits under the
   wishlist heart so the two never overlap, and is absent entirely on "off".
   Revealed by hovering its own parent rather than a named card class, because
   every layout frames its product image in a differently-named box. */
.sf-pin { position: absolute; top: 45px; right: 9px; width: 30px; height: 30px; background: #e60023; color: #fff; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,.18); opacity: 0; transition: opacity .2s; z-index: 3; }
.sf :hover > .sf-pin { opacity: 1; }
.sf .sf-pin-on { opacity: 1; }
.sf-cbadge { position: absolute; top: 9px; left: 9px; padding: 3px 9px; background: var(--sf-primary); color: #fff; font-size: 10px; font-weight: 700; border-radius: 9999px; }
.sf-cb { padding: var(--sf-card-pad, 13px); }
.sf-cb p { font-size: 14px; font-weight: 600; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sf-cm { display: flex; align-items: center; justify-content: space-between; }
.sf-price { font-size: 15px; font-weight: 800; color: var(--sf-primary); }
.sf-rating { display: flex; align-items: center; gap: 3px; font-size: 12px; opacity: .6; }
.sf-add { width: 100%; padding: 9px; background: var(--sf-primary); color: #fff; font-weight: 700; font-size: 13px; border: none; cursor: pointer; transition: filter .15s; display: flex; align-items: center; justify-content: center; gap: 5px; }
.sf-add:hover { filter: brightness(1.1); }

/* SECTIONS */
.sf-sec { max-width: 1440px; margin: 0 auto; padding: 64px 40px; }
.sf-sec-t { font-size: 28px; font-weight: 800; margin-bottom: 32px; }

/* PROMO */
.sf-promo { margin: 0 40px; border-radius: 20px; overflow: hidden; position: relative; min-height: 240px; display: flex; align-items: center; }
.sf-promo-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.sf-promo-ov { position: absolute; inset: 0; background: linear-gradient(to right, rgba(0,0,0,.7), rgba(0,0,0,.3)); }
.sf-promo-c { position: relative; z-index: 1; padding: 48px; }
.sf-promo-c h3 { font-size: 32px; font-weight: 800; color: #fff; margin-bottom: 8px; }
.sf-promo-c p { color: rgba(255,255,255,.85); margin-bottom: 24px; font-size: 16px; }
.sf-promo-btn { display: inline-block; padding: 12px 28px; background: #fff; color: var(--sf-primary); font-weight: 700; text-decoration: none; border-radius: var(--sf-r,10px); }

/* ABOUT */
.sf-about { max-width: 1440px; margin: 0 auto; padding: 64px 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
.sf-about img, .sf-about-ph { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 16px; background: rgba(0,0,0,0.05); }
.sf-about h2 { font-size: 36px; font-weight: 800; margin-bottom: 16px; }
.sf-about p { opacity: .75; font-size: 16px; line-height: 1.7; margin-bottom: 24px; }

/* NEWSLETTER */
.sf-nl { background: var(--sf-secondary, #f8f8f8); padding: 72px 40px; text-align: center; }
.sf-nl h2 { font-size: 30px; font-weight: 800; margin-bottom: 12px; }
.sf-nl p { opacity: .7; font-size: 15px; margin-bottom: 28px; }
.sf-nl form { display: flex; gap: 8px; justify-content: center; max-width: 400px; margin: 0 auto; }
.sf-nl input { flex: 1; padding: 11px 16px; border-radius: var(--sf-r,10px); border: 1.5px solid rgba(0,0,0,0.1); font-size: 14px; outline: none; font-family: inherit; }
.sf-nl input:focus { border-color: var(--sf-primary); }
.sf-nl button { padding: 11px 24px; background: var(--sf-primary); color: #fff; font-weight: 700; border: none; border-radius: var(--sf-r,10px); cursor: pointer; }

/* FOOTER */
.sf-footer { border-top: 1px solid rgba(0,0,0,0.07); padding: 48px 40px; }
.sf-footer-i { max-width: 1440px; margin: 0 auto; display: flex; justify-content: space-between; gap: 48px; }
.sf-footer a { display: block; color: var(--sf-text); opacity: .6; text-decoration: none; margin-bottom: 8px; font-size: 14px; }
.sf-footer a:hover { opacity: 1; }
.sf-footer-copy { font-size: 12px; opacity: .4; margin-top: 12px; }

/* KORAA ATTRIBUTION — every storefront, whether or not the footer is enabled */
.sf-koraa { border-top: 1px solid color-mix(in srgb, var(--sf-text) 10%, transparent); padding: 18px 40px; text-align: center; }
.sf-koraa a { color: var(--sf-text); opacity: .55; text-decoration: none; font-size: 13px; letter-spacing: .01em; }
.sf-koraa a strong { font-family: var(--sf-heading-font); font-weight: 800; }
.sf-koraa a:hover { opacity: 1; }

/* ENQUIRY FORM — the merchant's own questions, rendered by ContactForm */
.sf-cf { background: var(--sf-secondary, #f8f8f8); padding: 72px 40px; }
.sf-cf-i { max-width: 720px; margin: 0 auto; }
.sf-cf-h { text-align: center; margin-bottom: 32px; }
.sf-cf-h h2 { font-size: 30px; font-weight: 800; margin-bottom: 10px; }
.sf-cf-h p { opacity: .7; font-size: 15px; line-height: 1.65; }
.sf-cf-form { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.sf-cf-f { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 7px; }
.sf-cf-half { grid-column: span 1; }
.sf-cf-lbl { font-size: 13px; font-weight: 700; }
.sf-cf-req { color: var(--sf-primary); }
.sf-cf-f input[type=text], .sf-cf-f input[type=email], .sf-cf-f input[type=tel],
.sf-cf-f input[type=date], .sf-cf-f textarea, .sf-cf-f select {
  width: 100%; padding: 11px 14px; border-radius: var(--sf-r,10px);
  border: 1.5px solid color-mix(in srgb, var(--sf-text) 16%, transparent);
  background: #fff; color: #111; font-size: 14px; font-family: inherit; outline: none;
}
.sf-cf-f textarea { resize: vertical; min-height: 120px; line-height: 1.6; }
.sf-cf-f input:focus, .sf-cf-f textarea:focus, .sf-cf-f select:focus { border-color: var(--sf-primary); }
.sf-cf-f input[aria-invalid=true], .sf-cf-f textarea[aria-invalid=true], .sf-cf-f select[aria-invalid=true] { border-color: #ef4444; }
.sf-cf-choices { display: flex; flex-wrap: wrap; gap: 8px 20px; }
.sf-cf-choice { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
.sf-cf-choice input { accent-color: var(--sf-primary); width: 16px; height: 16px; cursor: pointer; }
.sf-cf-help { font-size: 12px; opacity: .6; }
.sf-cf-err { font-size: 12px; color: #ef4444; font-weight: 600; }
.sf-cf-banner { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; margin-bottom: 18px; padding: 11px 14px; border-radius: var(--sf-r,10px); background: rgba(239,68,68,.1); color: #b91c1c; font-size: 13.5px; font-weight: 600; }
.sf-cf-actions { grid-column: 1 / -1; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; margin-top: 6px; }
.sf-cf-send { padding: 13px 28px; background: var(--sf-primary); color: #fff; border: none; border-radius: var(--sf-r,10px); font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: filter .15s; }
.sf-cf-send:hover:not(:disabled) { filter: brightness(1.08); }
.sf-cf-send:disabled { opacity: .6; cursor: default; }
.sf-cf-call { font-size: 14px; color: var(--sf-text); opacity: .65; text-decoration: none; }
.sf-cf-call:hover { opacity: 1; }
.sf-cf-done, .sf-cf-empty { text-align: center; }
.sf-cf-done h2 { font-size: 26px; font-weight: 800; margin: 14px 0 8px; }
.sf-cf-done p { opacity: .75; font-size: 15px; line-height: 1.65; max-width: 46ch; margin: 0 auto; }
.sf-cf-done svg { color: var(--sf-primary); }
.sf-cf-again { margin-top: 22px; padding: 10px 22px; background: transparent; color: var(--sf-text); border: 1.5px solid color-mix(in srgb, var(--sf-text) 20%, transparent); border-radius: var(--sf-r,10px); font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.sf-cf-empty { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 28px; border: 1.5px dashed color-mix(in srgb, var(--sf-text) 24%, transparent); border-radius: var(--sf-r,10px); font-size: 14px; opacity: .8; }
.sf-cf-empty p { margin: 0; text-align: left; }
.sf-spin { animation: sf-spin 1s linear infinite; }
@keyframes sf-spin { to { transform: rotate(360deg); } }

.sf-mobile-menu-btn { display: none; background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px; color: var(--sf-text); }
.sf-mobile-menu-btn:hover { background: rgba(0,0,0,0.05); }

@media (max-width: 900px) {
  .sf-catalog { flex-direction: column; padding: 20px; gap: 20px; }
  .sf-sidebar { width: 100%; position: static; }
  .sf-cats { flex-direction: row; flex-wrap: wrap; gap: 8px; }
  .sf-cat { padding: 8px 12px; border: 1px solid rgba(0,0,0,0.1); }
  .sf-hero { height: 380px; }
  .sf-hero-h { font-size: 36px; }
  .sf-about { grid-template-columns: 1fr; padding: 40px 20px; gap: 32px; }
  .sf-nav-i { padding: 0 16px; gap: 12px; }
  .sf-search { display: none; }
  .sf-promo { margin: 0 16px; min-height: 200px; }
  .sf-promo-c { padding: 32px 24px; }
  .sf-promo-c h3 { font-size: 24px; }
  .sf-sec { padding: 40px 20px; }
  .sf-footer { padding: 32px 20px; }
  .sf-footer-i { flex-direction: column; gap: 32px; }
  .sf-koraa { padding: 16px 20px; }
  .sf-links { display: none; }
  .sf-mobile-menu-btn { display: flex; align-items: center; justify-content: center; }
  
  /* Additional mobile optimizations */
  .sf-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
  .sf-hero-btn { width: 100%; justify-content: center; }
  .sf-cb { padding: 10px; }
  .sf-cb p { font-size: 13px; }
  .sf-price { font-size: 14px; }
  .sf-add { font-size: 12px; padding: 8px; }
  .sf-nl { padding: 48px 20px; }
  .sf-nl h2 { font-size: 24px; }
  .sf-nl form { flex-direction: column; }
  .sf-cf { padding: 48px 20px; }
  .sf-cf-h h2 { font-size: 24px; }
  /* One column: a half-width field at 320px is a half-width field in name only. */
  .sf-cf-form { grid-template-columns: 1fr; }
  .sf-cf-half { grid-column: 1 / -1; }
  .sf-cf-send { width: 100%; justify-content: center; }
}
`;

// ── Section renderers ─────────────────────────────────────────────────────────

function AnnouncementBar({ s, cfg }: any) {
  if (!s.enabled) return null;
  return (
    <div className="sf-ann" style={{ background: s.settings.bg_color || "var(--sf-primary)", color: s.settings.text_color || "#fff" }}>
      {s.settings.text || "Welcome to our store!"}
    </div>
  );
}

function Navbar({ store, cfg }: NavbarProps) {
  const getCartCount = useCartStore(state => state.getCartCount);
  const count = getCartCount();
  const links = linkList(cfg.navigation?.links, [
    { label: "Home", url: "#" }, { label: "Shop", url: "#" }, { label: "About", url: "#" },
  ]);

  return (
    <header className="sf-nav">
      <div className="sf-nav-i">
        {store.logo ? <img src={store.logo} alt={store.name} style={{ height: 38, objectFit: "contain" }} />
          : <span className="sf-logo sf-d">{store.name}</span>}

        <nav className="sf-links">
          {links.map((l, i) => <a key={i} href={l.url} className="sf-link">{l.label}</a>)}
        </nav>

        <div className="sf-search"><LuSearch size={15} className="sf-si" /><input placeholder="Search products…" /></div>

        <div className="sf-actions">
          <div className="sf-btn" style={{ gap: 4 }}>
            <LuGlobe size={18} />
            <select className="sf-lang"><option value="en">EN</option><option value="fr">FR</option></select>
          </div>
          <button className="sf-btn"><LuUsers size={20} /></button>
          <Link href="/checkout" className="sf-btn" style={{ position: "relative", textDecoration: "none" }}>
            <LuShoppingBag size={20} />
            <span className="sf-badge">{count}</span>
          </Link>
          <button className="sf-mobile-menu-btn">
            <LuMenu size={24} />
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero({ s, store }: any) {
  if (!s.enabled) return null;
  return (
    <section className="sf-hero">
      {s.settings.image
        ? <img src={s.settings.image} alt="Hero" className="sf-hero-img" />
        : <div className="sf-hero-img" style={{ background: "linear-gradient(135deg, var(--sf-primary), var(--sf-accent, #8a4310))" }} />}
      {s.settings.overlay !== false && <div className="sf-hero-ov" />}
      <div className="sf-hero-c">
        <span className="sf-hero-tag">{store.name}</span>
        <h1 className="sf-hero-h sf-d">{s.settings.title || `Welcome to ${store.name}`}</h1>
        <p className="sf-hero-p">{s.settings.subtitle || store.tagline || "Discover our premium collection."}</p>
        <button className="sf-hero-btn">{s.settings.button_text || "Shop Now"} →</button>
      </div>
    </section>
  );
}

function Categories({ s }: any) {
  const { products } = useStorefront();
  if (!s.enabled) return null;
  // Derive unique category labels from real products (future: use real categories)
  const cats = [{ id: "all", label: "All Products", count: (products || []).length }];
  if ((products || []).some(p => p.is_featured)) {
    cats.push({ id: "featured", label: "Featured", count: (products || []).filter(p => p.is_featured).length });
  }
  if ((products || []).some(p => p.is_on_sale)) {
    cats.push({ id: "sale", label: "Sale", count: (products || []).filter(p => p.is_on_sale).length });
  }
  return (
    <div className="sf-sec" style={{ paddingBottom: 0 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {cats.map(c => (
          <button key={c.id} style={{ padding: "10px 20px", borderRadius: 9999, border: "1.5px solid rgba(0,0,0,0.1)", background: "transparent", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
            {c.label} <span style={{ opacity: .5 }}>({c.count})</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Catalog({ s, store }: any) {
  const { products } = useStorefront();
  if (!s.enabled) return null;
  const toShow = products || [];
  return (
    <div className="sf-catalog">
      <div className="sf-products">
        <div className="sf-gh">
          <h2>{s.settings.title || "Our Collection"}</h2>
          <select><option>Featured</option><option>Price: Low–High</option><option>Newest</option></select>
        </div>
        {toShow.length === 0 ? (
          <EmptyCatalog />
        ) : (
          <div className="sf-grid">
            {toShow.map(p => <ProductCard key={p.id} p={p} store={store} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function FeaturedProducts({ s, store }: any) {
  const { products } = useStorefront();
  if (!s.enabled) return null;
  const featured = (products || []).filter(p => p.is_featured).slice(0, 4);
  const toShow = featured.length > 0 ? featured : (products || []).slice(0, 4);
  if (toShow.length === 0) return null;
  return (
    <div className="sf-sec">
      <h2 className="sf-sec-t sf-d">{s.settings.title || "Featured Products"}</h2>
      <div className="sf-grid">
        {toShow.map(p => <ProductCard key={p.id} p={p} store={store} />)}
      </div>
    </div>
  );
}

function PromoBanner({ s }: any) {
  if (!s.enabled) return null;
  return (
    <div className="sf-promo">
      {s.settings.image
        ? <img src={s.settings.image} alt="Promo" className="sf-promo-img" />
        : <div className="sf-promo-img" style={{ background: "linear-gradient(135deg, var(--sf-primary), var(--sf-accent, #8a4310))" }} />}
      <div className="sf-promo-ov" />
      <div className="sf-promo-c">
        <h3 className="sf-d">{s.settings.title || "Special Offer"}</h3>
        <p>{s.settings.subtitle || "Up to 40% off this week."}</p>
        <a href={s.settings.button_url || "#"} className="sf-promo-btn">{s.settings.button_text || "Grab the Deal"}</a>
      </div>
    </div>
  );
}

function About({ s }: any) {
  if (!s.enabled) return null;
  return (
    <div className="sf-about">
      <div>
        <h2 className="sf-d">{s.settings.title || "Our Story"}</h2>
        <p>{s.settings.content || "We believe in quality products and exceptional service."}</p>
        <button style={{ padding: "12px 24px", background: "var(--sf-primary)", color: "#fff", border: "none", borderRadius: "var(--sf-r,10px)", fontWeight: 700, cursor: "pointer" }}>Learn More</button>
      </div>
      {s.settings.image
        ? <img src={s.settings.image} alt="About" />
        : <div className="sf-about-ph" />}
    </div>
  );
}

import toast from "react-hot-toast";

function Newsletter({ s }: any) {
  if (!s.enabled) return null;
  
  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const email = (form.querySelector('input[type="email"]') as HTMLInputElement).value;
    if (email) {
      toast.success("Thanks for subscribing!");
      form.reset();
    }
  };

  return (
    <div className="sf-nl">
      <h2 className="sf-d">{s.settings.title || "Stay in the Loop"}</h2>
      <p>{s.settings.subtitle || "Get new arrivals and exclusive deals."}</p>
      <form onSubmit={handleSubscribe}>
        <input type="email" placeholder={s.settings.placeholder || "Enter your email"} required />
        <button type="submit">{s.settings.button_text || "Subscribe"}</button>
      </form>
    </div>
  );
}

function Footer({ settings, store }: FooterProps) {
  return (
    <footer className="sf-footer">
      <div className="sf-footer-i">
        <div>
          <span className="sf-d" style={{ fontSize: 20, fontWeight: 800 }}>{store.name}</span>
          <p style={{ opacity: .6, marginTop: 8, maxWidth: 240, lineHeight: 1.65, fontSize: 14 }}>{str(settings.tagline, store.tagline || "Quality products, delivered.")}</p>
          <p className="sf-footer-copy">© {new Date().getFullYear()} {store.name}</p>
        </div>
        <div style={{ display: "flex", gap: 40 }}>
          <div>
            <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 13 }}>Quick Links</p>
            {linkList(settings.links, [{ label: "Home", url: "#" }, { label: "Shop", url: "#" }, { label: "About", url: "#" }]).map((l, i) => (
              <a key={i} href={l.url}>{l.label}</a>
            ))}
          </div>
          <div>
            <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 13 }}>Contact</p>
            {store.email && <a href={`mailto:${store.email}`}>{store.email}</a>}
            {store.phone && <a href={`tel:${store.phone}`}>{store.phone}</a>}
          </div>
        </div>
      </div>
    </footer>
  );
}

/**
 * The Koraa attribution bar every storefront carries beneath its footer.
 *
 * Built from NEXT_PUBLIC_ROOT_DOMAIN — the same variable `proxy.ts` strips to
 * find a store's slug — so it points at the platform's own landing page in dev
 * and in production without a second setting to keep in step.
 */
function KoraaBadge() {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
  const scheme = rootDomain.startsWith("localhost") || rootDomain.startsWith("127.") ? "http" : "https";
  return (
    <div className="sf-koraa">
      <a href={`${scheme}://${rootDomain}`} target="_blank" rel="noopener">
        Built with <strong>Koraa</strong>
      </a>
    </div>
  );
}

const SECTION_MAP: Record<string, React.FC<any>> = {
  announcement_bar: AnnouncementBar,
  hero: Hero,
  categories: Categories,
  featured_products: FeaturedProducts,
  catalog: Catalog,
  promo_banner: PromoBanner,
  about: About,
  newsletter: Newsletter,
  contact_form: ContactForm,
};

/** Button corner radius, from the chosen button_style. */
const BUTTON_RADIUS: Record<string, string> = {
  square: "0px",
  pill: "9999px",
  rounded: "10px",
};

/**
 * Font name → the self-hosted family declared in app/layout.tsx.
 *
 * The config stores a human name ("Poppins"). Emitting that straight into
 * `font-family` only worked for fonts the visitor happened to have
 * installed; next/font renames each family to a hashed local face and
 * exposes it as a CSS variable, so the variable is the only reliable
 * handle. Anything unrecognised falls back to Inter rather than to the
 * browser default.
 */
const FONT_VAR: Record<string, string> = {
  Inter: "var(--font-inter)",
  Outfit: "var(--font-outfit)",
  Poppins: "var(--font-poppins)",
  Lato: "var(--font-lato)",
  Raleway: "var(--font-raleway)",
  Nunito: "var(--font-nunito)",
};

export function fontStack(name: string | undefined, fallback: string): string {
  return FONT_VAR[name ?? ""] ?? FONT_VAR[fallback] ?? FONT_VAR.Inter;
}

/**
 * Product-grid density, from the chosen product_card_style.
 *
 * Compact packs more per row with a square crop; large gives each item a
 * tall portrait frame and room to breathe. Without this, the three card
 * styles were stored, sent to the browser, and then ignored — the grid
 * looked identical whichever one the merchant picked.
 */
const CARD_METRICS: Record<string, Record<string, string>> = {
  compact:  { "--sf-card-w": "170px", "--sf-card-gap": "12px", "--sf-card-pad": "10px", "--sf-card-ar": "1/1" },
  standard: { "--sf-card-w": "210px", "--sf-card-gap": "18px", "--sf-card-pad": "13px", "--sf-card-ar": "1/1" },
  large:    { "--sf-card-w": "280px", "--sf-card-gap": "26px", "--sf-card-pad": "18px", "--sf-card-ar": "3/4" },
};

// ── Root renderer ─────────────────────────────────────────────────────────────
export function StorefrontRenderer() {
  const { config, sections, store } = useStorefront();
  const siteSettings = useSiteSettings();

  // The one page view for this shop. Sends nothing in the editor preview, and
  // nothing until the visitor agrees where the merchant runs a consent banner.
  usePageView();

  const radius = BUTTON_RADIUS[config.button_style] ?? BUTTON_RADIUS.rounded;
  const cardMetrics = CARD_METRICS[config.product_card_style] ?? CARD_METRICS.standard;
  // Cards keep square corners under the Editorial and Direct kits — a
  // rounded card around a square button reads as an accident.
  const cardRadius = config.button_style === "square" ? "0px" : "14px";

  // Page structure. Colours and type leave the page the same shape, so
  // without this every category rendered one hero, one grid and one about
  // block in a different hue. Unknown or absent values resolve to classic,
  // which is what storefronts published before layouts existed were built as.
  const layout = resolveLayoutKey(config.layout);
  const layoutModule = resolveLayout(layout);

  const footerSection = sections.find(s => s.type === "footer");

  // `<html lang>` belongs to the root layout, which is shared with the
  // dashboard and cannot know which shop is being rendered. Setting it after
  // mount is the honest compromise: a screen reader picks up the shop's
  // language, and the crawler-facing declaration is the hreflang metadata the
  // page emits server-side.
  React.useEffect(() => {
    const code = siteSettings.default_language;
    if (code) document.documentElement.lang = code;
  }, [siteSettings.default_language]);

  // Chrome. Neither of these is in the merchant's section list — every
  // storefront has exactly one navbar and one footer — so a layout that needs
  // different chrome swaps the component rather than registering a section.
  const Nav = layoutModule.navbar ?? Navbar;
  const Foot = layoutModule.footer ?? Footer;

  return (
    <div className={`sf sf-l-${layout}`} style={{
      "--sf-primary":   config.primary_color    || STOREFRONT_DEFAULTS.primary,
      "--sf-accent":    config.accent_color      || STOREFRONT_DEFAULTS.accent,
      "--sf-bg":        config.background_color  || STOREFRONT_DEFAULTS.background,
      "--sf-text":      config.text_color        || STOREFRONT_DEFAULTS.text,
      "--sf-secondary": config.secondary_color   || STOREFRONT_DEFAULTS.secondary,
      "--sf-font":      fontStack(config.font, "Inter"),
      // Storefronts published before heading_font existed have no value
      // for it. Falling back to `font` keeps those shops looking exactly
      // as they did rather than switching their headings to Outfit the
      // moment this ships.
      "--sf-heading-font": fontStack(config.heading_font || config.font, "Outfit"),
      "--sf-r":         radius,
      "--sf-card-r":    cardRadius,
      // From Image Settings. A custom property rather than an inline attribute
      // on each `<img>`, so a layout with a structural reason to crop or
      // contain regardless can still override it in its own stylesheet.
      "--sf-img-fit":   siteSettings.image_fit === "contain" ? "contain" : "cover",
      ...cardMetrics,
      // Last, so a layout can override a metric it treats as structural
      // rather than cosmetic.
      ...layoutModule.vars,
    } as React.CSSProperties}>
      <style>{STYLES}</style>
      {layoutModule.styles && <style>{layoutModule.styles}</style>}

      <Nav store={store} cfg={config} />

      {/* Holds the selected filter above the section list, so a layout's
          category strip and its catalogue agree. Classic never reads it. */}
      <FacetProvider>
        {sections
          .filter(s => s.type !== "footer" && s.type !== "navbar")
          .sort((a, b) => a.order - b.order)
          .map(s => {
            const Comp: React.FC<any> | undefined =
              layoutModule.sections?.[s.type] ?? SECTION_MAP[s.type];
            return Comp ? <Comp key={s.id} s={s} store={store} cfg={config} /> : null;
          })}
      </FacetProvider>

      <Foot settings={footerSection?.settings ?? {}} store={store} />
      <KoraaBadge />
      {/* Fixed-position, so it sits outside the section flow and no layout has
          to leave room for it. Renders nothing unless the merchant turned it
          on in Cookies and Data Privacy. */}
      <CookieBanner />
    </div>
  );
}
