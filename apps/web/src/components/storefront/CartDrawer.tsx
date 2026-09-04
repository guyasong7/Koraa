"use client";
/**
 * The basket, as a slide-over panel.
 *
 * Mounted once by the root renderer, so all seven layouts get it without each
 * one growing its own copy. It opens by itself when something is added — see
 * `addItem` in `stores/cart` — because the previous behaviour was a number in
 * the navbar that (a) never updated and (b) nobody notices anyway. A shopper
 * who taps "Add to Cart" should see the thing land.
 *
 * Everything the basket can no longer only be done at checkout: change a
 * quantity, drop a line, empty the whole thing, and read the running subtotal
 * before committing to anything.
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  LuArrowRight,
  LuMinus,
  LuPlus,
  LuShoppingBag,
  LuTrash2,
  LuX,
} from "react-icons/lu";
import { useCartStore, useCartCount, useCartTotal } from "../../stores/cart";
import { useStorefront } from "../StorefrontProvider";
import { formatPrice } from "./shared";

export default function CartDrawer() {
  const isOpen = useCartStore(state => state.isOpen);
  const closeCart = useCartStore(state => state.closeCart);
  const items = useCartStore(state => state.items);
  const updateQuantity = useCartStore(state => state.updateQuantity);
  const removeItem = useCartStore(state => state.removeItem);
  const clearCart = useCartStore(state => state.clearCart);
  const count = useCartCount();
  const total = useCartTotal();
  const { store } = useStorefront();

  // Two-step, in place. A browser `confirm()` box in the middle of a shop looks
  // like something has gone wrong, and emptying a basket by accident is the one
  // mistake here that cannot be undone.
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCart();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [isOpen, closeCart]);

  // Reset the confirmation whenever the panel closes or the basket empties, so
  // reopening never shows a half-finished question.
  useEffect(() => {
    if (!isOpen || items.length === 0) setConfirming(false);
  }, [isOpen, items.length]);

  if (!isOpen) return null;

  return (
    <div className="sf-cart-wrap" role="dialog" aria-modal="true" aria-label="Your cart">
      <div className="sf-cart-ov" onClick={closeCart} />
      <aside className="sf-cart">
        <header className="sf-cart-h">
          <div>
            <p className="sf-cart-h-t sf-d">Your cart</p>
            <p className="sf-cart-h-s">
              {count === 0 ? "Nothing in it yet" : `${count} item${count === 1 ? "" : "s"}`}
            </p>
          </div>
          <button className="sf-cart-x" onClick={closeCart} aria-label="Close cart">
            <LuX size={18} />
          </button>
        </header>

        {items.length === 0 ? (
          <div className="sf-cart-empty">
            <LuShoppingBag size={38} />
            <p>Your cart is empty.</p>
            <button className="sf-cart-ghost" onClick={closeCart}>
              Continue shopping
            </button>
          </div>
        ) : (
          <>
            <div className="sf-cart-list">
              {items.map(({ product, quantity }) => (
                <div className="sf-cart-item" key={product.id}>
                  <div className="sf-cart-thumb">
                    {product.image ? (
                      <img src={product.image} alt={product.name} />
                    ) : (
                      <LuShoppingBag size={20} />
                    )}
                  </div>
                  <div className="sf-cart-info">
                    <p className="sf-cart-name">{product.name}</p>
                    <p className="sf-cart-each">
                      {formatPrice(store, product.base_price)} each
                    </p>
                    <div className="sf-cart-qty">
                      <button
                        onClick={() => updateQuantity(product.id, quantity - 1)}
                        disabled={quantity <= 1}
                        aria-label={`Fewer ${product.name}`}
                      >
                        <LuMinus size={13} />
                      </button>
                      <span aria-live="polite">{quantity}</span>
                      <button
                        onClick={() => updateQuantity(product.id, quantity + 1)}
                        aria-label={`More ${product.name}`}
                      >
                        <LuPlus size={13} />
                      </button>
                      <button
                        className="sf-cart-rm"
                        onClick={() => removeItem(product.id)}
                        aria-label={`Remove ${product.name}`}
                        title="Remove"
                      >
                        <LuTrash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="sf-cart-line">
                    {formatPrice(
                      store,
                      parseFloat(product.base_price) * quantity,
                    )}
                  </p>
                </div>
              ))}
            </div>

            <footer className="sf-cart-f">
              <div className="sf-cart-sum">
                <span>Subtotal</span>
                <strong>{formatPrice(store, total)}</strong>
              </div>
              <p className="sf-cart-note">
                Delivery is arranged with {store.name} after you order.
              </p>
              <Link href="/checkout" className="sf-cart-go" onClick={closeCart}>
                Checkout <LuArrowRight size={16} />
              </Link>

              {confirming ? (
                <div className="sf-cart-confirm">
                  <span>Empty the whole cart?</span>
                  <div>
                    <button
                      className="sf-cart-yes"
                      onClick={() => {
                        clearCart();
                        setConfirming(false);
                      }}
                    >
                      Yes, empty it
                    </button>
                    <button className="sf-cart-ghost" onClick={() => setConfirming(false)}>
                      Keep it
                    </button>
                  </div>
                </div>
              ) : (
                <button className="sf-cart-ghost" onClick={() => setConfirming(true)}>
                  <LuTrash2 size={13} /> Clear cart
                </button>
              )}
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
