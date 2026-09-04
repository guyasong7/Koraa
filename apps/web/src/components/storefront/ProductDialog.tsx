"use client";
/**
 * The product detail dialog a card opens.
 *
 * A Koraa storefront is a single page — there is no `/products/<slug>` route to
 * send anyone to — so before this the description a merchant wrote was
 * unreachable to the customer. Tapping a card now opens it here, with the whole
 * gallery and the same add-to-cart control the card carries.
 *
 * Mounted once by the root renderer, alongside `CartDrawer`, and driven by the
 * `QuickViewProvider` context in `shared.tsx`. That indirection is what lets a
 * layout's own bespoke card open it without importing this file.
 */
import React, { useEffect, useState } from "react";
import { LuMail, LuShoppingBag, LuX } from "react-icons/lu";
import { useStorefront } from "../StorefrontProvider";
import {
  StockNote,
  formatPrice,
  useCardAction,
  useQuickView,
} from "./shared";

export default function ProductDialog() {
  const { product, close } = useQuickView();
  const { store } = useStorefront();
  const action = useCardAction();
  const [shot, setShot] = useState(0);

  useEffect(() => {
    if (!product) return;
    setShot(0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [product, close]);

  if (!product) return null;

  const act = action(product);
  // `images` is absent on a storefront serialised before the gallery existed;
  // `image` has always been there.
  const gallery = product.images?.length
    ? product.images
    : product.image
      ? [product.image]
      : [];
  const body = product.description?.trim() || product.short_description?.trim() || "";
  const compare = product.compare_at_price ? parseFloat(product.compare_at_price) : null;
  const price = parseFloat(product.base_price);
  const showCompare = compare !== null && Number.isFinite(compare) && compare > price;

  return (
    <div className="sf-pd-wrap" role="dialog" aria-modal="true" aria-label={product.name}>
      <div className="sf-pd-ov" onClick={close} />
      <div className="sf-pd">
        <button className="sf-pd-x" onClick={close} aria-label="Close">
          <LuX size={18} />
        </button>

        <div className="sf-pd-media">
          <div className="sf-pd-main">
            {gallery.length > 0 ? (
              <img src={gallery[Math.min(shot, gallery.length - 1)]} alt={product.name} />
            ) : (
              <LuShoppingBag size={52} color="rgba(0,0,0,0.12)" />
            )}
          </div>
          {gallery.length > 1 && (
            <div className="sf-pd-thumbs">
              {gallery.map((src, i) => (
                <button
                  key={src}
                  className={i === shot ? "sf-pd-thumb sf-pd-thumb-on" : "sf-pd-thumb"}
                  onClick={() => setShot(i)}
                  aria-label={`Photo ${i + 1} of ${product.name}`}
                >
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="sf-pd-body">
          <div className="sf-pd-tags">
            {product.category && <span className="sf-pd-cat">{product.category.name}</span>}
            {product.is_on_sale && <span className="sf-pd-flag">SALE</span>}
            {!product.is_on_sale && product.is_featured && (
              <span className="sf-pd-flag">FEATURED</span>
            )}
          </div>

          <h2 className="sf-pd-name sf-d">{product.name}</h2>

          <div className="sf-pd-prices">
            <span className="sf-pd-price">{formatPrice(store, product.base_price)}</span>
            {showCompare && (
              <span className="sf-pd-was">{formatPrice(store, product.compare_at_price!)}</span>
            )}
            <StockNote p={product} />
          </div>

          {body ? (
            <p className="sf-pd-desc">{body}</p>
          ) : (
            <p className="sf-pd-desc sf-pd-desc-none">
              No description yet — ask {store.name} for details.
            </p>
          )}

          {act.kind !== "none" && (
            <button
              className="sf-pd-add"
              disabled={act.disabled}
              onClick={event => {
                // Adding opens the cart drawer, so the dialog steps out of the
                // way rather than stacking two panels on top of each other.
                act.run(event);
                if (!act.disabled) close();
              }}
            >
              {act.kind === "enquire" ? <LuMail size={15} /> : <LuShoppingBag size={15} />}{" "}
              {act.label}
            </button>
          )}

          <button className="sf-pd-back" onClick={close}>
            Keep browsing
          </button>
        </div>
      </div>
    </div>
  );
}
