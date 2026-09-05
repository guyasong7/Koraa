"use client";
import React from "react";
import { useStorefront } from "../StorefrontProvider";
import {
  EmptyCatalog,
  FacetProvider,
  ProductCard,
  QuickViewProvider,
  applyFacet,
  deriveFacets,
  useFacet,
} from "./shared";
import { resolveLayout, resolveLayoutKey } from "./registry";
import CartDrawer from "./CartDrawer";
import ProductDialog from "./ProductDialog";
import { CookieBanner } from "./CookieBanner";
import { STOREFRONT_DEFAULTS } from "./theme";
import { useSearchParams } from "next/navigation";
import { Navbar as ClassicNavbar, Footer as ClassicFooter } from "../StorefrontRenderer";

/** Sort orders the catalogue offers. `featured` is the order the API sends. */
const SORTS: Record<string, (a: any, b: any) => number> = {
  featured: () => 0,
  "price-asc": (a, b) => parseFloat(a.base_price) - parseFloat(b.base_price),
  "price-desc": (a, b) => parseFloat(b.base_price) - parseFloat(a.base_price),
  name: (a, b) => a.name.localeCompare(b.name),
};

function ShopCatalog() {
  const { store, products } = useStorefront();
  const { active, setActive } = useFacet();
  const [sort, setSort] = React.useState("featured");
  
  // Read search query if any
  const searchParams = useSearchParams();
  const q = searchParams.get("q")?.toLowerCase() || "";

  let filtered = applyFacet(products || [], active);
  if (q) {
    filtered = filtered.filter((p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
  }
  
  const toShow = sort === "featured" ? filtered : [...filtered].sort(SORTS[sort]);
  const facets = deriveFacets(products || []);
  const activeLabel = facets.find(f => f.id === active)?.label;

  return (
    <div className="sf-catalog sf-shop-page" style={{ display: "flex", gap: "32px", maxWidth: "1440px", margin: "0 auto", padding: "40px" }}>
      {/* Sidebar */}
      <div className="sf-sidebar" style={{ width: "240px", flexShrink: 0 }}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", fontFamily: "var(--sf-heading-font, Outfit)" }}>Categories</h3>
        <div className="sf-cats" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {facets.map((f) => {
            const on = active === f.id;
            return (
              <button
                key={f.id}
                className="sf-cat"
                onClick={() => setActive(f.id)}
                style={{
                  background: "none", border: "none", textAlign: "left", cursor: "pointer", fontSize: "14px",
                  color: on ? "var(--sf-primary)" : "var(--sf-text)",
                  fontWeight: on ? 600 : 400,
                  padding: "4px 0",
                  opacity: on ? 1 : 0.7,
                }}
              >
                {f.label} <span style={{ opacity: 0.5, fontSize: "12px", marginLeft: "4px" }}>({f.count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid */}
      <div className="sf-products" style={{ flex: 1 }}>
        <div className="sf-gh" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
          <h2 style={{ fontSize: "28px", fontWeight: 800, fontFamily: "var(--sf-heading-font, Outfit)", margin: 0 }}>
            {q ? `Search results for "${q}"` : "All Products"}
          </h2>
          <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort products" style={{ padding: "8px 12px", borderRadius: "var(--sf-r, 8px)", border: "1px solid rgba(0,0,0,0.1)", background: "transparent", cursor: "pointer" }}>
            <option value="featured">Featured first</option>
            <option value="price-asc">Price: Low–High</option>
            <option value="price-desc">Price: High–Low</option>
            <option value="name">Name: A–Z</option>
          </select>
        </div>
        
        {toShow.length === 0 ? (
          active === "all" || !activeLabel ? (
            <EmptyCatalog />
          ) : (
            <div className="sf-none">
              <p>Nothing in {activeLabel} right now.</p>
              <button className="sf-none-btn" onClick={() => setActive("all")}>
                Show everything
              </button>
            </div>
          )
        ) : (
          <div className="sf-grid">
            {toShow.map(p => <ProductCard key={p.id} p={p} store={store} />)}
          </div>
        )}
      </div>
      
      <style>{`
        .sf-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 24px;
        }
        @media (max-width: 768px) {
          .sf-shop-page { flex-direction: column; padding: 20px !important; }
          .sf-sidebar { width: 100% !important; margin-bottom: 24px; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 24px; }
          .sf-cats { flex-direction: row !important; overflow-x: auto; white-space: nowrap; -webkit-overflow-scrolling: touch; }
          .sf-cat { padding: 8px 16px !important; background: rgba(0,0,0,0.04) !important; border-radius: 9999px !important; }
        }
      `}</style>
    </div>
  );
}

export function ShopRenderer() {
  const { store, config, sections } = useStorefront();
  const layout = config?.layout || "classic";
  const layoutKey = resolveLayoutKey(layout);
  const layoutModule = resolveLayout(layout);

  const footerSection = sections?.find(s => s.type === "footer");

  const LayoutNavbar = layoutModule.navbar ?? ClassicNavbar;
  const LayoutFooter = layoutModule.footer ?? ClassicFooter;

  const vars = {
    "--sf-primary": config?.primary_color || STOREFRONT_DEFAULTS.primary,
    "--sf-text": config?.text_color || STOREFRONT_DEFAULTS.text,
    "--sf-bg": config?.background_color || STOREFRONT_DEFAULTS.background,
    "--sf-secondary": config?.secondary_color || STOREFRONT_DEFAULTS.secondary,
    "--sf-font": config?.font || "Inter",
    "--sf-heading-font": config?.heading_font || config?.font || "Outfit",
    "--sf-r": config?.button_style === "square" ? "0px" : config?.button_style === "pill" ? "9999px" : "10px",
    ...(layoutModule.vars || {}),
  } as React.CSSProperties;

  return (
    <FacetProvider>
      <QuickViewProvider>
        <div className={`sf sf-l-${layoutKey}`} style={vars}>
          {layoutModule.styles && <style>{layoutModule.styles}</style>}
          
          <LayoutNavbar store={store} cfg={config ?? {} as any} />

          <div className="sf-content" style={{ minHeight: "60vh" }}>
            <ShopCatalog />
          </div>

          <LayoutFooter store={store} settings={footerSection?.settings ?? {}} />
          
          <CartDrawer />
          <ProductDialog />
          <CookieBanner />
        </div>
      </QuickViewProvider>
    </FacetProvider>
  );
}
