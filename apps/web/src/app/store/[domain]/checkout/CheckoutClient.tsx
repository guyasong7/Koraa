"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { LuLock, LuCreditCard, LuSmartphone, LuChevronRight, LuPackage, LuArrowLeft, LuShoppingBag, LuCheck, LuLoader } from "react-icons/lu";
import { useCartStore } from "@/stores/cart";
import { publicStorefrontApi } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import { STOREFRONT_DEFAULTS } from "@/components/storefront/theme";
import toast from "react-hot-toast";

type StoreTheme = {
  name: string;
  primary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  secondary_color: string;
  font: string;
  button_style: string;
};

export default function CheckoutClient({ domain }: { domain: string }) {
  const { items, getCartTotal, clearCart } = useCartStore();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<StoreTheme | null>(null);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    customer_email: "",
    customer_phone: "",
    firstName: "",
    lastName: "",
    shipping_address: "",
    city: "",
    postal_code: "",
  });

  const [loading, setLoading] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1);

  // This page is outside `StorefrontProvider` — it fetches the shop itself —
  // so it cannot use the tracker hook and measures with `trackEvent` instead.
  // Once only: React re-runs effects in development, and a doubled funnel is
  // worse than none.
  const measured = useRef(false);

  useEffect(() => {
    setMounted(true);
    // Fetch store theme so checkout matches the storefront design
    publicStorefrontApi.getStorefront(domain).then((res: any) => {
      const data = res.data;

      // The route's `domain` may be a custom host rather than the shop's slug,
      // and the collect endpoint resolves shops by slug — so the slug has to
      // come from the payload, not from the URL.
      const slug = data?.store?.slug;
      if (slug && !measured.current) {
        measured.current = true;
        const banner = String(data?.settings?.cookie_banner ?? "off");
        trackEvent({ slug, banner, kind: "page_view" });
        // Only with something in the cart. Arriving here with an empty one is
        // a shopper whose cart was cleared, not a checkout beginning, and
        // counting it would make the abandonment figure flattering nonsense.
        if (useCartStore.getState().items.length > 0) {
          trackEvent({ slug, banner, kind: "checkout_start" });
        }
      }

      if (data?.store && data?.config) {
        setTheme({
          name: data.store.name,
          primary_color: data.config.primary_color || STOREFRONT_DEFAULTS.primary,
          accent_color: data.config.accent_color || STOREFRONT_DEFAULTS.accent,
          background_color: data.config.background_color || STOREFRONT_DEFAULTS.background,
          text_color: data.config.text_color || STOREFRONT_DEFAULTS.text,
          secondary_color: data.config.secondary_color || STOREFRONT_DEFAULTS.secondary,
          font: data.config.font || STOREFRONT_DEFAULTS.font,
          button_style: data.config.button_style || "rounded",
        });
      }
    }).catch(() => {});
  }, [domain]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const proceedToReview = () => {
    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }
    if (!formData.customer_email || !formData.firstName || !formData.lastName || !formData.shipping_address || !formData.city) {
      toast.error("Please fill in all required fields");
      return;
    }
    setCheckoutStep(2);
  };

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const payload = {
        customer_name: `${formData.firstName} ${formData.lastName}`.trim(),
        customer_email: formData.customer_email,
        customer_phone: formData.customer_phone,
        shipping_address: formData.shipping_address,
        city: formData.city,
        postal_code: formData.postal_code,
        items: items.map(i => ({
          product_id: i.product.id,
          quantity: i.quantity
        }))
      };

      const res = await publicStorefrontApi.checkout(domain, payload);

      clearCart();

      if (res.data?.payment_link) {
        window.location.href = res.data.payment_link;
      } else {
        setOrderSuccess(true);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.detail || "Failed to place order. Please try again.");
      setCheckoutStep(1); // Go back if error
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  const primary = theme?.primary_color || STOREFRONT_DEFAULTS.primary;
  const accent = theme?.accent_color || STOREFRONT_DEFAULTS.accent;
  const bg = theme?.background_color || STOREFRONT_DEFAULTS.background;
  const textColor = theme?.text_color || STOREFRONT_DEFAULTS.text;
  const secondaryBg = theme?.secondary_color || STOREFRONT_DEFAULTS.secondary;
  const font = theme?.font || STOREFRONT_DEFAULTS.font;
  const radius = theme?.button_style === "square" ? "0px" : theme?.button_style === "pill" ? "9999px" : "10px";
  const subtotal = getCartTotal();
  const total = subtotal;

  const cssVars = {
    "--sf-primary": primary,
    "--sf-accent": accent,
    "--sf-bg": bg,
    "--sf-text": textColor,
    "--sf-secondary": secondaryBg,
    "--sf-font": font,
    "--sf-r": radius,
  } as React.CSSProperties;

  if (orderSuccess) {
    return (
      <div style={{ ...cssVars, minHeight: "100vh", background: bg, fontFamily: `${font}, sans-serif`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 480, padding: "48px 24px" }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: `${primary}20`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
            <LuCheck size={32} color={primary} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: textColor, marginBottom: 12 }}>Order Placed!</h1>
          <p style={{ color: textColor, opacity: 0.6, lineHeight: 1.65, marginBottom: 32 }}>
            Thank you for your order. We'll send a confirmation to {formData.customer_email}.
          </p>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", background: primary, color: "#fff", borderRadius: radius, fontWeight: 700, textDecoration: "none", fontSize: 15 }}>
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...cssVars, minHeight: "100vh", background: bg, fontFamily: `var(--font-${font.toLowerCase().replace(/\s+/g, "-")}), ${font}, sans-serif`, color: textColor }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .co-nav { position: sticky; top: 0; z-index: 100; background: ${bg}; border-bottom: 1px solid rgba(0,0,0,0.08); backdrop-filter: blur(12px); }
        .co-nav-i { max-width: 1200px; margin: 0 auto; padding: 0 32px; height: 64px; display: flex; align-items: center; justify-content: space-between; }
        .co-logo { font-size: 20px; font-weight: 800; color: ${textColor}; text-decoration: none; }
        .co-secure { display: flex; align-items: center; gap: 6px; font-size: 13px; color: ${textColor}; opacity: 0.5; }
        .co-body { max-width: 1200px; margin: 0 auto; padding: 40px 32px; display: grid; grid-template-columns: 1fr 400px; gap: 40px; align-items: start; }
        @media (max-width: 860px) { .co-body { grid-template-columns: 1fr; } .co-summary { order: -1; } }
        .co-breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 32px; opacity: 0.6; }
        .co-breadcrumb span.active { opacity: 1; font-weight: 600; color: ${primary}; }
        .co-section { background: ${secondaryBg}; border: 1px solid rgba(0,0,0,0.07); border-radius: 12px; padding: 28px; margin-bottom: 20px; }
        .co-section-title { font-size: 15px; font-weight: 700; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
        .co-step { width: 26px; height: 26px; border-radius: 50%; background: ${primary}; color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .co-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .co-full { grid-column: 1 / -1; }
        @media (max-width: 500px) { .co-grid { grid-template-columns: 1fr; } }
        .co-label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.04em; }
        /* Same corner as .co-btn below, via the same --sf-r the rest of the
           storefront uses for fields (.sf-nl input, .sf-cf-input). This was a
           hardcoded 8px, so a merchant who chose square or pill buttons got
           them everywhere except the checkout form, where the fields stayed
           rounded and the button beside them did not.
           No backticks in this block: it lives inside a template literal, and
           one would close the string. */
        .co-input { width: 100%; padding: 11px 14px; border: 1.5px solid rgba(0,0,0,0.12); border-radius: var(--sf-r, 10px); font-family: inherit; font-size: 14px; background: ${bg}; color: ${textColor}; outline: none; transition: border-color 0.15s; }
        .co-input:focus { border-color: ${primary}; }
        .co-radio-card { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1.5px solid rgba(0,0,0,0.1); border-radius: 10px; cursor: pointer; transition: all 0.15s; margin-bottom: 10px; background: ${bg}; }
        .co-radio-card.selected { border-color: ${primary}; background: ${primary}15; }
        .co-radio-card.disabled { opacity: 0.45; cursor: not-allowed; }
        .co-radio-card-label { flex: 1; }
        .co-radio-card-label strong { display: block; font-size: 14px; font-weight: 600; }
        .co-radio-card-label span { font-size: 13px; opacity: 0.6; margin-top: 2px; display: block; }
        .co-btn { width: 100%; padding: 16px; background: ${primary}; color: #fff; border: none; border-radius: ${radius}; font-family: inherit; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: filter 0.2s, transform 0.15s; margin-top: 24px; }
        .co-btn:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
        .co-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .co-summary { background: ${secondaryBg}; border: 1px solid rgba(0,0,0,0.07); border-radius: 12px; padding: 28px; position: sticky; top: 84px; }
        .co-summary-title { font-size: 16px; font-weight: 800; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid rgba(0,0,0,0.08); }
        .co-item { display: flex; gap: 14px; margin-bottom: 16px; }
        .co-item-img { width: 60px; height: 60px; border-radius: 8px; overflow: hidden; background: rgba(0,0,0,0.05); flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .co-item-info { flex: 1; }
        .co-item-name { font-size: 14px; font-weight: 600; line-height: 1.35; }
        .co-item-qty { font-size: 13px; opacity: 0.55; margin-top: 4px; }
        .co-item-price { font-size: 14px; font-weight: 700; white-space: nowrap; }
        .co-divider { border: none; border-top: 1px dashed rgba(0,0,0,0.1); margin: 20px 0; }
        .co-row { display: flex; justify-content: space-between; align-items: center; font-size: 14px; margin-bottom: 10px; }
        .co-row span:first-child { opacity: 0.6; }
        .co-total { display: flex; justify-content: space-between; align-items: center; font-size: 18px; font-weight: 800; margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.1); }
        .co-total-amount { color: ${primary}; }
        .co-back { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; color: ${textColor}; opacity: 0.6; text-decoration: none; margin-bottom: 24px; transition: opacity 0.15s; }
        .co-back:hover { opacity: 1; }
        .co-trust { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12px; opacity: 0.45; margin-top: 12px; }
      `}</style>

      {/* Navbar */}
      <nav className="co-nav">
        <div className="co-nav-i">
          <Link href="/" className="co-logo">{theme?.name || domain}</Link>
          <div className="co-secure">
            <LuLock size={13} />
            Secure Checkout
          </div>
        </div>
      </nav>

      <div className="co-body">
        {/* Left: Forms */}
        <div>
          <Link href="/" className="co-back">
            <LuArrowLeft size={16} /> Continue Shopping
          </Link>

          <div className="co-breadcrumb">
            <span>Cart</span>
            <LuChevronRight size={12} />
            <span className="active">Information & Shipping</span>
            <LuChevronRight size={12} />
            <span>Payment</span>
          </div>

          {/* Contact Info */}
          <div className="co-section">
            <div className="co-section-title">
              <span className="co-step">1</span> Contact Information
            </div>
            <div className="co-grid">
              <div className="co-full">
                <label className="co-label">Email Address *</label>
                <input className="co-input" type="email" name="customer_email" value={formData.customer_email} onChange={handleInputChange} placeholder="you@example.com" />
              </div>
              <div className="co-full">
                <label className="co-label">Phone Number (Optional)</label>
                <input className="co-input" type="tel" name="customer_phone" value={formData.customer_phone} onChange={handleInputChange} placeholder="+237 600 000 000" />
              </div>
            </div>
          </div>

          {/* Shipping */}
          <div className="co-section">
            <div className="co-section-title">
              <span className="co-step">2</span> Shipping Address
            </div>
            <div className="co-grid">
              <div>
                <label className="co-label">First Name *</label>
                <input className="co-input" type="text" name="firstName" value={formData.firstName} onChange={handleInputChange} placeholder="John" />
              </div>
              <div>
                <label className="co-label">Last Name *</label>
                <input className="co-input" type="text" name="lastName" value={formData.lastName} onChange={handleInputChange} placeholder="Doe" />
              </div>
              <div className="co-full">
                <label className="co-label">Street Address *</label>
                <input className="co-input" type="text" name="shipping_address" value={formData.shipping_address} onChange={handleInputChange} placeholder="123 Main Street, Apt 4B" />
              </div>
              <div>
                <label className="co-label">City *</label>
                <input className="co-input" type="text" name="city" value={formData.city} onChange={handleInputChange} placeholder="Yaoundé" />
              </div>
              <div>
                <label className="co-label">Postal Code</label>
                <input className="co-input" type="text" name="postal_code" value={formData.postal_code} onChange={handleInputChange} placeholder="000000" />
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className="co-section">
            <div className="co-section-title">
              <span className="co-step">3</span> Payment Method
            </div>
            <div className="co-radio-card selected">
              <input type="radio" defaultChecked style={{ accentColor: primary, width: 18, height: 18 }} />
              <LuSmartphone size={22} color={primary} />
              <div className="co-radio-card-label">
                <strong>Mobile Money</strong>
                <span>Pay instantly via MTN MoMo or Orange Money</span>
              </div>
            </div>
            <div className="co-radio-card disabled">
              <input type="radio" disabled style={{ width: 18, height: 18 }} />
              <LuCreditCard size={22} style={{ opacity: 0.4 }} />
              <div className="co-radio-card-label">
                <strong>Credit / Debit Card</strong>
                <span>Coming soon — Visa, Mastercard</span>
              </div>
            </div>
          </div>

          {checkoutStep === 1 ? (
            <button className="co-btn" onClick={proceedToReview} disabled={items.length === 0}>
              Continue to Review
            </button>
          ) : (
            <div className="co-section" style={{ border: `2px solid ${primary}`, background: `${primary}08` }}>
              <div className="co-section-title" style={{ marginBottom: 12 }}>
                <span className="co-step">4</span> Review & Pay
              </div>
              <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 20, lineHeight: 1.5 }}>
                Please confirm your details. You are about to pay <strong>{total.toLocaleString()} XAF</strong> via secure payment gateway.
              </p>
              
              <div style={{ padding: "16px", background: bg, borderRadius: 8, border: "1px solid rgba(0,0,0,0.05)", marginBottom: 20, fontSize: 13, lineHeight: 1.6 }}>
                <strong>Deliver to:</strong><br />
                {formData.firstName} {formData.lastName}<br />
                {formData.shipping_address}, {formData.city}<br />
                {formData.customer_email} {formData.customer_phone && `• ${formData.customer_phone}`}
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <button className="co-btn" onClick={() => setCheckoutStep(1)} disabled={loading} style={{ flex: 1, background: "transparent", color: textColor, border: "1px solid rgba(0,0,0,0.2)" }}>
                  Back
                </button>
                <button className="co-btn" onClick={handleCheckout} disabled={loading} style={{ flex: 2, marginTop: 0 }}>
                  {loading ? (
                    <><LuLoader size={16} className="spin" /> Processing…</>
                  ) : (
                    <><LuLock size={16} /> Pay {total.toLocaleString()} XAF Now</>
                  )}
                </button>
              </div>
            </div>
          )}
          
          <p className="co-trust">
            <LuLock size={12} /> Your payment is secured with 256-bit encryption
          </p>
        </div>

        {/* Right: Order Summary */}
        <div className="co-summary">
          <div className="co-summary-title">
            <LuShoppingBag size={18} style={{ display: "inline", verticalAlign: "middle", marginRight: 8, color: primary }} />
            Order Summary ({items.reduce((t, i) => t + i.quantity, 0)} items)
          </div>

          {items.length === 0 ? (
            <p style={{ opacity: 0.5, fontSize: 14 }}>Your cart is empty.</p>
          ) : (
            <>
              {items.map((item, idx) => (
                <div key={idx} className="co-item">
                  <div className="co-item-img">
                    {item.product.image ? (
                      <img src={item.product.image} alt={item.product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <LuPackage size={22} style={{ opacity: 0.35 }} />
                    )}
                  </div>
                  <div className="co-item-info">
                    <div className="co-item-name">{item.product.name}</div>
                    <div className="co-item-qty">Qty: {item.quantity}</div>
                  </div>
                  <div className="co-item-price">{(parseFloat(item.product.base_price) * item.quantity).toLocaleString()} XAF</div>
                </div>
              ))}

              <hr className="co-divider" />

              <div className="co-row">
                <span>Subtotal</span>
                <span style={{ fontWeight: 600 }}>{subtotal.toLocaleString()} XAF</span>
              </div>
              <div className="co-row">
                <span>Shipping</span>
                <span style={{ color: primary, fontWeight: 600 }}>Calculated at delivery</span>
              </div>

              <div className="co-total">
                <span>Total</span>
                <span className="co-total-amount">{total.toLocaleString()} XAF</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
