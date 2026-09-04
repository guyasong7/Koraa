"use client";
/**
 * Pieces shared between the classic renderer and the layout variants.
 *
 * Everything here is layout-agnostic: the product card the classic grid uses,
 * the facet state a filtering layout drives, and the small coercions that let
 * a variant read `section.settings` (typed `Record<string, unknown>`) without
 * falling back to `any` the way the original section components did.
 */
import React, { createContext, useContext, useEffect, useState } from "react";
import { LuHeart, LuMail, LuPin, LuShoppingBag, LuX } from "react-icons/lu";
import { useCartCount, useCartStore } from "../../stores/cart";
import { useStorefrontTracker } from "../../lib/analytics";
import { useStorefront } from "../StorefrontProvider";
import { pinterestSaveUrl, useImageAttrs, useSiteSettings } from "./siteSettings";
import type {
  SectionType,
  Store,
  StorefrontConfig,
  StorefrontProduct,
  StorefrontSection,
} from "../../types/storefront";

/** Every section component — classic or variant — takes this. */
export interface SectionProps {
  s: StorefrontSection;
  store: Store;
  cfg: StorefrontConfig;
}

/**
 * The navbar, which a layout may replace outright.
 *
 * Unlike a section, the navbar is not in the merchant's section list — it is
 * always present and always first — so it is overridden per layout rather
 * than per section type. `cfg.navigation.links` still supplies the links
 * whichever variant renders them, so switching layout never loses a menu the
 * merchant typed in.
 */
export interface NavbarProps {
  store: Store;
  cfg: StorefrontConfig;
}

/**
 * The footer, likewise.
 *
 * Takes `settings` rather than a section: a shop with no footer row still
 * gets a footer, and passing `{ settings: {} }` as a fake section meant every
 * variant had to guard `s?.settings` before reading anything.
 */
export interface FooterProps {
  settings: Record<string, unknown>;
  store: Store;
}

// ── settings coercion ─────────────────────────────────────────────────────────
//
// `settings` is free-form JSON, so a variant that renders `s.settings.title`
// straight into JSX is rendering `unknown`. These also treat "" as absent,
// which matters because several presets ship `"image": ""` as a placeholder.

export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() !== "" ? v : fallback;
}

export function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** A `{label, url}` list out of free-form settings JSON. */
export function linkList(
  v: unknown,
  fallback: Array<{ label: string; url: string }> = [],
): Array<{ label: string; url: string }> {
  if (!Array.isArray(v)) return fallback;
  const out = v
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map(x => ({ label: str(x.label), url: str(x.url, "#") }))
    .filter(l => l.label !== "");
  return out.length > 0 ? out : fallback;
}

/** "1 500 000" with the store's currency in front.
 *
 * Takes only the currency rather than a whole `Store`: the checkout knows its
 * shop's currency but never loads the full storefront payload, and it was
 * hardcoding "XAF" in five places for want of this signature. Every existing
 * caller passes a `Store`, which still satisfies it.
 */
export function formatPrice(store: Pick<Store, "currency">, value: string | number): string {
  const n = typeof value === "number" ? value : parseFloat(value);
  const amount = Number.isFinite(n) ? n.toLocaleString() : String(value);
  return `${store.currency || "XAF"} ${amount}`;
}

/** First letter(s) of a product name, for layouts that render no photography. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * False on the server and on the first client render, true after.
 *
 * The cart is persisted in `localStorage`, which the server cannot see, so
 * anything that renders a basket — the navbar count, the drawer — disagrees
 * with the server's HTML on a shopper who has items and reloads. React reports
 * that as a hydration error in the console. Gating on this renders the empty
 * state first and fills it in a tick later, which costs nothing visible and is
 * the difference between a clean console and a page of red.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

// ── Facets ────────────────────────────────────────────────────────────────────
//
// A facet is one tab in the category strip. The merchant's own categories come
// first — those are the groupings a shopper thinks in — followed by the two
// flags the payload also carries. Categories are derived from the products
// present rather than fetched separately, so a category with nothing in it
// never becomes a tab that leads to an empty grid.
//
// Category ids are prefixed so they cannot collide with `all`/`featured`/`sale`
// however a merchant names a category.

export interface Facet {
  id: string;
  label: string;
  count: number;
}

const CAT_PREFIX = "cat:";

/** The facet id for a category, or `all` when the product has none. */
export function categoryFacetId(categoryId: string): string {
  return `${CAT_PREFIX}${categoryId}`;
}

export function deriveFacets(products: StorefrontProduct[]): Facet[] {
  const all = products || [];
  const facets: Facet[] = [{ id: "all", label: "All Products", count: all.length }];

  // Insertion order, which is the API's order — featured first, then newest —
  // so the strip is stable between loads without a second sort.
  const cats = new Map<string, Facet>();
  for (const p of all) {
    if (!p.category) continue;
    const id = categoryFacetId(p.category.id);
    const seen = cats.get(id);
    if (seen) seen.count += 1;
    else cats.set(id, { id, label: p.category.name, count: 1 });
  }
  facets.push(...cats.values());

  const featured = all.filter(p => p.is_featured);
  if (featured.length > 0) {
    facets.push({ id: "featured", label: "Featured", count: featured.length });
  }
  const sale = all.filter(p => p.is_on_sale);
  if (sale.length > 0) {
    facets.push({ id: "sale", label: "Sale", count: sale.length });
  }
  return facets;
}

export function applyFacet(products: StorefrontProduct[], id: string): StorefrontProduct[] {
  const all = products || [];
  if (id === "featured") return all.filter(p => p.is_featured);
  if (id === "sale") return all.filter(p => p.is_on_sale);
  if (id.startsWith(CAT_PREFIX)) {
    const categoryId = id.slice(CAT_PREFIX.length);
    return all.filter(p => p.category?.id === categoryId);
  }
  return all;
}

interface FacetState {
  active: string;
  setActive: (id: string) => void;
}

const FacetCtx = createContext<FacetState | null>(null);

/**
 * Holds the active facet above the section list.
 *
 * A layout's category strip and its catalogue are two separate sections that
 * the merchant can order independently, so the selection cannot live in
 * either one. The classic components never read this, which is how `classic`
 * keeps rendering exactly as it did.
 */
export function FacetProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState("all");
  return <FacetCtx.Provider value={{ active, setActive }}>{children}</FacetCtx.Provider>;
}

/** Shared facet selection, with a local fallback if rendered outside a provider. */
export function useFacet(): FacetState {
  const ctx = useContext(FacetCtx);
  // Called unconditionally to keep hook order stable whether or not the
  // provider is present.
  const [local, setLocal] = useState("all");
  return ctx ?? { active: local, setActive: setLocal };
}

/** Whether the merchant has this section switched on, used to avoid duplicate controls. */
export function useHasSection(type: SectionType): boolean {
  const { sections } = useStorefront();
  return (sections || []).some(s => s.type === type && s.enabled);
}

// ── Quick view ────────────────────────────────────────────────────────────────
//
// A Koraa storefront is one page, so there is nowhere to send a shopper who
// wants to read a product's description. The card opens a dialog instead. The
// state lives above the section list, next to the facet, because the dialog is
// mounted once by the root renderer and every layout's own card needs to reach
// it — see `ProductDialog`, which supplies the markup.

interface QuickViewState {
  product: StorefrontProduct | null;
  open: (p: StorefrontProduct) => void;
  close: () => void;
}

const QuickViewCtx = createContext<QuickViewState | null>(null);

export function QuickViewProvider({ children }: { children: React.ReactNode }) {
  const [product, setProduct] = useState<StorefrontProduct | null>(null);
  return (
    <QuickViewCtx.Provider
      value={{ product, open: setProduct, close: () => setProduct(null) }}
    >
      {children}
    </QuickViewCtx.Provider>
  );
}

/**
 * Open a product's detail dialog.
 *
 * Falls back to doing nothing outside a provider rather than throwing: a layout
 * rendered in isolation by a test should still mount.
 */
export function useQuickView(): QuickViewState {
  const ctx = useContext(QuickViewCtx);
  return ctx ?? { product: null, open: () => {}, close: () => {} };
}

/**
 * Props that make any card open the dialog — spread onto the card's root.
 *
 * Keyboard-reachable, because the card is a `div` in every layout and a shopper
 * on a keyboard has no other way to read a description. Controls inside the
 * card (add to cart, zoom, Pinterest) already stop propagation, so they keep
 * working.
 */
export function useQuickViewTrigger(p: StorefrontProduct) {
  const { open } = useQuickView();
  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `View details for ${p.name}`,
    onClick: () => open(p),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open(p);
      }
    },
  };
}

// ── Cart control ──────────────────────────────────────────────────────────────

/**
 * The bag in a navbar, and the only correct way to render the count.
 *
 * Two things were wrong with what each navbar did by hand. It selected
 * `state.getCartCount` — the *method*, which is referentially stable — so the
 * component never re-subscribed to `items` and the number stayed at whatever it
 * first rendered; that was the reported "add to cart is lagging". And it linked
 * straight to `/checkout`, so there was no way to look at a basket without
 * starting to pay for it. This opens the drawer instead.
 *
 * `count` is suppressed until mount because the basket comes out of
 * `localStorage`, which the server cannot read.
 */
export function CartButton({
  className = "sf-btn",
  badgeClassName = "sf-badge",
  size = 20,
  label,
}: {
  className?: string;
  /** A layout with its own badge geometry passes its own class. */
  badgeClassName?: string;
  size?: number;
  label?: string;
}) {
  const openCart = useCartStore(state => state.openCart);
  const mounted = useMounted();
  const count = useCartCount();
  const shown = mounted ? count : 0;

  return (
    <button
      type="button"
      className={className}
      onClick={openCart}
      style={{ position: "relative", background: "none", border: "none", cursor: "pointer", font: "inherit" }}
      aria-label={label ?? `Open cart, ${shown} item${shown === 1 ? "" : "s"}`}
    >
      <LuShoppingBag size={size} />
      {/* Hidden at zero. An empty shop showed a permanent "0" badge, which
          reads as a broken counter rather than an empty basket. */}
      {shown > 0 && <span className={badgeClassName}>{shown > 99 ? "99+" : shown}</span>}
    </button>
  );
}

// ── Product imagery ───────────────────────────────────────────────────────────

/**
 * One product photograph, with the Image Settings that reach it.
 *
 * Every layout renders its product image through this rather than a bare
 * `<img>`, so a merchant who turns off lazy loading or click-to-zoom gets it on
 * the price list and the lookbook tile as well as the classic grid. The frame
 * around it stays each layout's business — this only fills whatever box it is
 * put in.
 *
 * How the image fills that box is *not* set here. It comes through the
 * `--sf-img-fit` custom property the root sets from the merchant's choice, so
 * the CSS cascade decides it and a layout with a structural reason to differ
 * (techgrid pads and contains its product shots; the menu thumb is 56px and has
 * to crop) can still say so. An inline `object-fit` would beat both.
 *
 * Click-to-zoom opens a full-screen viewer rather than scaling in place: a
 * product image inside a 210px card has nowhere to grow, and the shopper
 * wanting a closer look wants the whole photograph.
 */
export function ProductMedia({
  product,
  placeholder,
}: {
  product: StorefrontProduct;
  placeholder?: React.ReactNode;
}) {
  const { loading, decoding, zoom } = useImageAttrs();
  const track = useStorefrontTracker();
  const [open, setOpen] = useState(false);

  if (!product.image) {
    return <>{placeholder ?? <LuShoppingBag size={48} color="rgba(0,0,0,0.07)" />}</>;
  }

  return (
    <>
      <img
        src={product.image}
        alt={product.name}
        loading={loading}
        decoding={decoding}
        style={zoom ? { cursor: "zoom-in" } : undefined}
        onClick={
          zoom
            ? event => {
                // The whole card is clickable in most layouts, so the zoom must
                // not also trigger whatever the card does.
                event.stopPropagation();
                event.preventDefault();
                setOpen(true);
                // A Koraa storefront is one page, so there is no product page
                // to count a visit to. Opening a product's image is the nearest
                // deliberate act of interest in one thing, and the analytics
                // page labels it as "opened" rather than "viewed" for that
                // reason.
                track("product_view", { product: product.id, label: product.name });
              }
            : undefined
        }
      />
      {open && <Lightbox product={product} onClose={() => setOpen(false)} />}
    </>
  );
}

function Lightbox({
  product,
  onClose,
}: {
  product: StorefrontProduct;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Without this the page behind scrolls under the viewer on a trackpad.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
      onClick={event => {
        event.stopPropagation();
        onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,.88)",
        display: "grid",
        placeItems: "center",
        padding: 28,
        cursor: "zoom-out",
      }}
    >
      <img
        src={product.image ?? ""}
        alt={product.name}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          borderRadius: 6,
        }}
      />
      <button
        onClick={event => {
          event.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        style={{
          position: "fixed",
          top: 18,
          right: 20,
          background: "rgba(255,255,255,.14)",
          color: "#fff",
          border: "none",
          borderRadius: "50%",
          width: 38,
          height: 38,
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
        }}
      >
        <LuX size={18} />
      </button>
      <p
        style={{
          position: "fixed",
          bottom: 20,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "rgba(255,255,255,.72)",
          fontSize: 13,
        }}
      >
        {product.name}
      </p>
    </div>
  );
}

/**
 * The Pinterest "Save" button, from the Pinterest Save Buttons panel.
 *
 * `hover` reveals it with the card's other hover controls; `always` keeps it
 * visible, which is what a shop whose traffic comes from Pinterest wants. It
 * renders nothing at all on `off`, so the default costs no markup.
 */
export function PinSaveButton({
  product,
  store,
}: {
  product: StorefrontProduct;
  store: Store;
}) {
  const settings = useSiteSettings();
  const mode = settings.pinterest_save ?? "off";
  if (mode === "off" || !product.image) return null;

  // Read at click time rather than at render: the server has no location, and
  // reading it during render would make this component fail hydration.
  const open = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const url = pinterestSaveUrl(store, product, window.location.href);
    if (url) window.open(url, "_blank", "noopener,width=760,height=620");
  };

  return (
    <button
      onClick={open}
      className={mode === "always" ? "sf-pin sf-pin-on" : "sf-pin"}
      aria-label={`Save ${product.name} to Pinterest`}
      title="Save to Pinterest"
    >
      <LuPin size={13} />
    </button>
  );
}

// ── Card actions ──────────────────────────────────────────────────────────────
//
// Three kinds of thing now reach a storefront and only one of them belongs in a
// basket, so no layout can go on writing `disabled={!p.in_stock}` and calling
// it a day.

/** The id the enquiry section renders on, so `#enquiry` links land on it. */
export const ENQUIRY_ANCHOR = "enquiry";

/** Fired at the enquiry form when a product card sends a visitor to it. */
export const ENQUIRY_EVENT = "koraa:enquire";

/**
 * Scroll to the enquiry form and tell it what prompted the visit.
 *
 * The form's fields are the merchant's own, so this cannot fill in a named
 * one — it announces the product and the section decides whether any field it
 * happens to have is worth pre-filling.
 */
export function requestEnquiry(product = "") {
  if (typeof document === "undefined") return;
  document.getElementById(ENQUIRY_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" });
  window.dispatchEvent(new CustomEvent(ENQUIRY_EVENT, { detail: { product } }));
}

/**
 * What a product card's control does.
 *
 * A digital product is never out of stock, but it is unsellable until the
 * merchant uploads a file — checkout refuses that line — so the card has to say
 * so rather than take money for nothing. A service is quoted, not priced: its
 * control sends the visitor to the enquiry form. `none` means there is no
 * honest control to render and the card shows its price alone.
 */
export interface CardAction {
  kind: "cart" | "enquire" | "none";
  /** Ready to render: already reflects stock, files and product type. */
  label: string;
  disabled: boolean;
  /** Stops propagation, so a whole-card click handler does not fire twice. */
  run: (event?: React.MouseEvent) => void;
}

/**
 * Per-layout wording.
 *
 * Each layout says this in its own voice — "Book this", "Add to bag", "Get it
 * now" — and losing that was never the point of centralising the logic. The
 * unsellable-digital label is deliberately not overridable: it reports a state
 * rather than setting a tone.
 */
export interface CardActionWords {
  /** In stock. Default "Add to Cart". */
  cart?: string;
  /** Out of stock. Default "Out of Stock". */
  soldOut?: string;
  /** Digital, with at least one file. Default "Buy & download". */
  digital?: string;
  /** A service the shop quotes. Default "Enquire". */
  enquire?: string;
}

/**
 * Where a service enquiry goes.
 *
 * The on-page form is the good answer, but it only exists when the merchant has
 * both switched the form on and left the section enabled. Failing that a
 * `mailto:` still reaches them. A shop with neither gets no button, because an
 * enquiry control that leads nowhere is worse than a price on its own.
 */
function useEnquiryTarget(): { mode: "section" | "mailto" | "none"; email: string } {
  const { store, service_form } = useStorefront();
  const hasSection = useHasSection("contact_form");
  if (service_form && hasSection) return { mode: "section", email: store.email || "" };
  if (store.email) return { mode: "mailto", email: store.email };
  return { mode: "none", email: "" };
}

function enquiryMailto(email: string, store: Store, p: StorefrontProduct): string {
  const subject = `Enquiry: ${p.name}`;
  const body = `Hello ${store.name},\n\nI would like a quote for ${p.name}.\n\n`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Resolver for a card's control, called once per layout and then per product.
 *
 * It returns a function rather than an action so a layout can map over its
 * catalogue: the hooks are all here, in the layout's own render.
 */
export function useCardAction(): (p: StorefrontProduct, words?: CardActionWords) => CardAction {
  const addItem = useCartStore(state => state.addItem);
  const target = useEnquiryTarget();
  const { store } = useStorefront();
  const track = useStorefrontTracker();

  // Wrapped once, rather than at each of the two call sites below, so a third
  // product type added later cannot be added to the cart unmeasured.
  const cart = (p: StorefrontProduct) => {
    addItem(p);
    track("add_to_cart", { product: p.id, label: p.name });
  };

  return (p, words = {}) => {
    const stop = (event?: React.MouseEvent) => {
      event?.stopPropagation();
      event?.preventDefault();
    };

    if (p.product_type === "service") {
      // `accepts_enquiries` off means the merchant does not want to be asked
      // about this one; it stays on the page as a price and a description.
      if (p.accepts_enquiries === false || target.mode === "none") {
        return { kind: "none", label: "", disabled: true, run: () => {} };
      }
      return {
        kind: "enquire",
        label: words.enquire ?? "Enquire",
        disabled: false,
        run: event => {
          stop(event);
          if (target.mode === "section") requestEnquiry(p.name);
          else window.location.href = enquiryMailto(target.email, store, p);
        },
      };
    }

    if (p.product_type === "digital") {
      const ready = (p.file_count ?? 0) > 0;
      return {
        kind: "cart",
        label: ready ? words.digital ?? "Buy & download" : "Coming soon",
        disabled: !ready,
        run: event => {
          stop(event);
          if (ready) cart(p);
        },
      };
    }

    return {
      kind: "cart",
      label: p.in_stock ? words.cart ?? "Add to Cart" : words.soldOut ?? "Out of Stock",
      disabled: !p.in_stock,
      run: event => {
        stop(event);
        if (p.in_stock) cart(p);
      },
    };
  };
}

/**
 * The stock line under a price.
 *
 * Only a stocked product has one. "Out of stock" on a service is nonsense, and
 * on a digital product it is a lie.
 */
export function StockNote({ p }: { p: StorefrontProduct }) {
  const stocked = !p.product_type || p.product_type === "simple" || p.product_type === "variable";
  if (!stocked || p.in_stock) return null;
  return <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 700 }}>Out of stock</span>;
}

// ── Classic product card ──────────────────────────────────────────────────────

export function ProductCard({ p, store }: { p: StorefrontProduct; store: Store }) {
  const action = useCardAction();
  const act = action(p);
  const trigger = useQuickViewTrigger(p);

  return (
    <div className="sf-card sf-card-tap" {...trigger}>
      <div className="sf-ci">
        <ProductMedia product={p} />
        {p.is_on_sale && <span className="sf-cbadge">SALE</span>}
        {!p.is_on_sale && p.is_featured && <span className="sf-cbadge">FEATURED</span>}
        <button
          className="sf-wl"
          aria-label="Save for later"
          onClick={event => event.stopPropagation()}
        >
          <LuHeart size={14} />
        </button>
        <PinSaveButton product={p} store={store} />
      </div>
      <div className="sf-cb">
        <p>{p.name}</p>
        <div className="sf-cm">
          <span className="sf-price">{formatPrice(store, p.base_price)}</span>
          <StockNote p={p} />
        </div>
      </div>
      {act.kind !== "none" && (
        <button className="sf-add" disabled={act.disabled} onClick={act.run}>
          {act.kind === "enquire" ? <LuMail size={13} /> : <LuShoppingBag size={13} />} {act.label}
        </button>
      )}
    </div>
  );
}

/** Shared empty state, so every catalogue variant says the same thing. */
export function EmptyCatalog({ label = "No products yet." }: { label?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", opacity: 0.5 }}>
      <LuShoppingBag size={40} />
      <p style={{ marginTop: 12 }}>{label}</p>
    </div>
  );
}
