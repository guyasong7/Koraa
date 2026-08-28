"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  LuLock, LuSmartphone, LuChevronRight, LuPackage, LuArrowLeft,
  LuShoppingBag, LuCheck, LuLoader, LuTriangleAlert, LuClock, LuCircleAlert,
} from "react-icons/lu";
import { useCartStore } from "@/stores/cart";
import {
  publicStorefrontApi,
  type ChargedOrder,
  type CreatedOrder,
  type OrderStatus,
  type PaymentMedium,
} from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import { STOREFRONT_DEFAULTS } from "@/components/storefront/theme";
import { formatPrice } from "@/components/storefront/shared";
import {
  MEDIUM_MTN, MEDIUM_ORANGE, inferMedium, isPlausibleEmail,
  isPlausibleMsisdn, mediumLabel, normaliseMsisdn,
} from "@/lib/momo";
import { usePaymentPolling, POLL_TIMEOUT_MS } from "@/hooks/usePaymentPolling";
import toast from "react-hot-toast";

type StoreTheme = {
  name: string;
  currency: string;
  primary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  secondary_color: string;
  font: string;
  button_style: string;
};

/**
 * Where the shopper is in paying.
 *
 * The two-step shape is deliberate. `form` → `review` creates the order without
 * charging anything, so the shopper is shown the **server's** price before they
 * approve a payment: the cart in this browser sums `base_price` while the server
 * prices the default variant's `effective_price`, and those can legitimately
 * differ. When one request did both, that difference could only ever be
 * discovered after the money had gone.
 *
 * `unknown` is not a failure. It means the charge never resolved — real money may
 * have moved, and a webhook or the reconcile sweep will finish the order without
 * this browser. Rendering it as "payment failed" would tell a shopper whose
 * payment succeeded that it did not, and would invite them to pay twice.
 */
type PayState =
  | { kind: "form" }
  | { kind: "creating" }
  | { kind: "review"; order: CreatedOrder }
  | { kind: "charging"; order: CreatedOrder }
  | { kind: "awaiting"; order: CreatedOrder; charge: ChargedOrder }
  | { kind: "paid"; order: CreatedOrder; status: OrderStatus }
  | { kind: "failed"; order: CreatedOrder; reason: string }
  | { kind: "unknown"; order: CreatedOrder; reference: string };

const REQUIRED_TEXT = "This field is required.";

export default function CheckoutClient({ domain }: { domain: string }) {
  const { items, getCartTotal, clearCart } = useCartStore();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<StoreTheme | null>(null);
  /** Set when the shop cannot take an order at all: unpublished, or gated. */
  const [shopBlocked, setShopBlocked] = useState<"locked" | "missing" | null>(null);

  const [formData, setFormData] = useState({
    customer_email: "",
    customer_phone: "",
    firstName: "",
    lastName: "",
    shipping_address: "",
    city: "",
    postal_code: "",
  });
  /** Keyed by field name, so a message renders under the input that caused it. */
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [state, setState] = useState<PayState>({ kind: "form" });

  // The mobile money number, kept apart from `customer_phone`: the number that
  // holds the wallet is not always the one the shop should ring about a delivery.
  const [momo, setMomo] = useState("");
  const [medium, setMedium] = useState<PaymentMedium | null>(null);
  /** True once the shopper picks a network themselves, which stops the prefix
   *  guess from overwriting their choice on the next keystroke. */
  const mediumChosen = useRef(false);

  // This page is outside `StorefrontProvider` — it fetches the shop itself —
  // so it cannot use the tracker hook and measures with `trackEvent` instead.
  // Once only: React re-runs effects in development, and a doubled funnel is
  // worse than none.
  const measured = useRef(false);

  useEffect(() => {
    setMounted(true);
    publicStorefrontApi.getStorefront(domain).then((res: any) => {
      const data = res.data;

      // A locked shop returns a 200 carrying `locked` and no catalogue. Checkout
      // has to honour it: the create endpoint only accepts published shops, so
      // letting the form through would end in a 404 after the shopper had filled
      // it in.
      if (data?.locked) {
        setShopBlocked("locked");
        return;
      }

      // The route's `domain` may be a custom host rather than the shop's slug,
      // and the collect endpoint resolves shops by slug — so the slug has to
      // come from the payload, not from the URL.
      //
      // Only `checkout_start`. The dashboard has always rendered a "Reached
      // checkout" stat and a chart series for it and nothing ever fired it, so
      // it read zero for every shop. No `page_view`: that metric belongs to the
      // storefront tracker and counts content pages, and adding the checkout to
      // it would quietly change what an existing number means.
      const slug = data?.store?.slug;
      if (slug && !measured.current) {
        measured.current = true;
        // Arriving with an empty cart is a shopper whose cart was cleared, not a
        // checkout beginning; counting it would make the abandonment figure
        // flattering nonsense.
        if (useCartStore.getState().items.length > 0) {
          trackEvent({
            slug,
            banner: String(data?.settings?.cookie_banner ?? "off"),
            kind: "checkout_start",
          });
        }
      }

      if (data?.store && data?.config) {
        setTheme({
          name: data.store.name,
          currency: data.store.currency || "XAF",
          primary_color: data.config.primary_color || STOREFRONT_DEFAULTS.primary,
          accent_color: data.config.accent_color || STOREFRONT_DEFAULTS.accent,
          background_color: data.config.background_color || STOREFRONT_DEFAULTS.background,
          text_color: data.config.text_color || STOREFRONT_DEFAULTS.text,
          secondary_color: data.config.secondary_color || STOREFRONT_DEFAULTS.secondary,
          font: data.config.font || STOREFRONT_DEFAULTS.font,
          button_style: data.config.button_style || "rounded",
        });
      }
    }).catch(() => {
      // Any non-2xx from this endpoint means no shop is being served here.
      setShopBlocked("missing");
    });
  }, [domain]);

  const currency = theme?.currency || "XAF";
  const money = (value: string | number) => formatPrice({ currency }, value);

  // ── The payment, once a charge has been accepted ───────────────────────────

  const awaitingOrderId = state.kind === "awaiting" ? state.order.id : null;

  const polling = usePaymentPolling<OrderStatus>({
    queryKey: ["order-status", awaitingOrderId],
    enabled: awaitingOrderId !== null,
    fetcher: async () => {
      const res = await publicStorefrontApi.getOrderStatus(awaitingOrderId!);
      return res.data;
    },
    onPaid: (status) => {
      // The only place the cart is emptied. Doing it on submit — as this page
      // used to — destroyed the basket before anything was confirmed, so a
      // shopper whose payment failed had nothing left to retry with.
      clearCart();
      setState((prev) =>
        prev.kind === "awaiting" ? { kind: "paid", order: prev.order, status } : prev
      );
    },
    onFailed: () => {
      setState((prev) =>
        prev.kind === "awaiting"
          ? {
              kind: "failed",
              order: prev.order,
              reason:
                "The payment was not completed. Nothing has been charged — you can try again.",
            }
          : prev
      );
    },
    onTimeout: () => {
      setState((prev) =>
        prev.kind === "awaiting"
          ? { kind: "unknown", order: prev.order, reference: prev.charge.reference }
          : prev
      );
    },
  });

  // ── Form ───────────────────────────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear this field's error as it is corrected, rather than leaving stale red
    // text under an input the shopper has already fixed.
    setErrors((prev) => (prev[name] ? { ...prev, [name]: "" } : prev));
  };

  const validateDetails = () => {
    const found: Record<string, string> = {};
    if (!formData.firstName.trim()) found.firstName = REQUIRED_TEXT;
    if (!formData.lastName.trim()) found.lastName = REQUIRED_TEXT;
    if (!formData.shipping_address.trim()) found.shipping_address = REQUIRED_TEXT;
    if (!formData.city.trim()) found.city = REQUIRED_TEXT;
    if (!formData.customer_email.trim()) found.customer_email = REQUIRED_TEXT;
    // Was a truthiness check, so "x" passed as an email and the confirmation and
    // any download links went nowhere.
    else if (!isPlausibleEmail(formData.customer_email)) {
      found.customer_email = "That does not look like an email address.";
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  /** Create the order — prices it and holds the stock. Charges nothing. */
  const submitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      toast.error("Your cart is empty.");
      return;
    }
    if (!validateDetails()) return;

    setState({ kind: "creating" });
    try {
      const res = await publicStorefrontApi.checkout(domain, {
        customer_name: `${formData.firstName} ${formData.lastName}`.trim(),
        customer_email: formData.customer_email.trim(),
        customer_phone: formData.customer_phone.trim(),
        shipping_address: formData.shipping_address.trim(),
        city: formData.city.trim(),
        postal_code: formData.postal_code.trim(),
        items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
      });
      const order = res.data;
      // Seed the wallet number from the contact number when it could hold one, so
      // the common case arrives with the field filled and a network pre-selected.
      // Stored normalised, both because that is what the field should display and
      // because it is what gets sent.
      if (!momo && isPlausibleMsisdn(formData.customer_phone)) {
        const seeded = normaliseMsisdn(formData.customer_phone);
        setMomo(seeded);
        if (!mediumChosen.current) setMedium(inferMedium(seeded));
      }
      setState({ kind: "review", order });
    } catch (err: any) {
      const detail =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        "We could not start your order. Please try again.";
      toast.error(detail);
      setState({ kind: "form" });
    }
  };

  const chargeOrder = async (order: CreatedOrder) => {
    if (!isPlausibleMsisdn(momo)) {
      setErrors((prev) => ({
        ...prev,
        momo: "Enter a mobile money number — nine digits starting with 6.",
      }));
      return;
    }
    setErrors((prev) => ({ ...prev, momo: "" }));
    setState({ kind: "charging", order });

    try {
      const res = await publicStorefrontApi.chargeOrder(order.id, {
        phone: normaliseMsisdn(momo),
        // Sent only when the shopper picked a network. Otherwise Fapshi detects
        // it from the number, which it does better than our prefix table.
        ...(mediumChosen.current && medium ? { medium } : {}),
      });

      if (res.status === 202 || res.data.charge_accepted === false) {
        // Fapshi never answered. The charge may or may not exist, so this is
        // neither a success nor a failure and must not be retried automatically.
        setState({ kind: "unknown", order, reference: res.data.reference });
        return;
      }
      setState({ kind: "awaiting", order, charge: res.data });
    } catch (err: any) {
      const status = err.response?.status;
      const body = err.response?.data;

      // 409 — a charge for this order already exists, and none of the answers is
      // "charge again". The conflict body carries no reference and its
      // `payment_status` can be any terminal value, so ask the status endpoint
      // rather than guessing from it: that is the authority the polling loop
      // reads anyway.
      if (status === 409) {
        try {
          const live = (await publicStorefrontApi.getOrderStatus(order.id)).data;
          if (live.settled && live.payment_status === "paid") {
            clearCart();
            setState({ kind: "paid", order, status: live });
            return;
          }
          if (live.settled) {
            setState({
              kind: "failed",
              order,
              reason:
                body?.error || "That payment did not complete. Nothing has been charged.",
            });
            return;
          }
          // Not settled: a charge is genuinely in flight and the prompt is
          // already on their handset. Watch it instead of starting a second one.
          setState({
            kind: "awaiting",
            order,
            charge: { ...live, charge_accepted: true },
          });
          toast(body?.error || "A payment for this order is already waiting for your approval.");
          return;
        } catch {
          // Could not read the order back. Say what the server said and leave the
          // shopper on review rather than inventing an outcome.
          toast.error(body?.error || "There is already a payment in progress for this order.");
          setState({ kind: "review", order });
          return;
        }
      }

      // 503 — Fapshi is unreachable, so whether an earlier attempt is live is
      // unknown. Back to review; trying again in a moment is safe.
      if (status === 503) {
        toast.error(body?.error || "We cannot reach the payment provider. Please try again in a moment.");
        setState({ kind: "review", order });
        return;
      }

      // 400 — refused, and nothing was charged. Usually a number the shopper can
      // correct, and the order is still chargeable, so stay on review.
      const fieldError = Array.isArray(body?.phone) ? body.phone[0] : null;
      const message =
        fieldError || body?.error || body?.detail || "That payment was refused. Please check the number and try again.";
      setErrors((prev) => ({ ...prev, momo: message }));
      setState({ kind: "review", order });
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

  /** What this browser thinks the basket costs. An estimate — see `serverTotal`. */
  const cartEstimate = getCartTotal();

  const order = "order" in state ? state.order : null;
  /** The authoritative figure, once the server has priced the cart. */
  const serverTotal = order ? parseFloat(order.total_amount) : null;
  /** A real disagreement between the two, worth showing before charging. */
  const priceDiffers =
    serverTotal !== null && Math.abs(serverTotal - cartEstimate) >= 1;

  const cssVars = {
    "--sf-primary": primary,
    "--sf-accent": accent,
    "--sf-bg": bg,
    "--sf-text": textColor,
    "--sf-secondary": secondaryBg,
    "--sf-font": font,
    "--sf-r": radius,
  } as React.CSSProperties;

  const shellStyle: React.CSSProperties = {
    ...cssVars,
    minHeight: "100vh",
    background: bg,
    fontFamily: `${font}, sans-serif`,
    color: textColor,
  };

  const styles = (
    <style>{`
      * { box-sizing: border-box; margin: 0; padding: 0; }
      @keyframes co-spin { to { transform: rotate(360deg); } }
      .co-spin { animation: co-spin 0.9s linear infinite; }
      @keyframes co-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
      .co-pulse { animation: co-pulse 1.6s ease-in-out infinite; }
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
      /* Same corner as .co-btn below, via the same --sf-r the storefront's own
         fields use (see .sf-nl input in StorefrontRenderer). This was a
         hardcoded 8px, so a merchant who chose square or pill buttons got them
         everywhere except the checkout form, where the fields stayed rounded and
         the button beside them did not.
         No backticks in this block: it lives inside a template literal, and one
         would close the string. */
      .co-input { width: 100%; padding: 11px 14px; border: 1.5px solid rgba(0,0,0,0.12); border-radius: var(--sf-r, 10px); font-family: inherit; font-size: 14px; background: ${bg}; color: ${textColor}; outline: none; transition: border-color 0.15s; }
      .co-input:focus { border-color: ${primary}; }
      .co-input.invalid { border-color: #dc2626; }
      .co-err { display: block; font-size: 12px; color: #dc2626; margin-top: 5px; font-weight: 500; }
      .co-hint { display: block; font-size: 12px; opacity: 0.55; margin-top: 5px; }
      .co-radio-card { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1.5px solid rgba(0,0,0,0.1); border-radius: 10px; cursor: pointer; transition: all 0.15s; margin-bottom: 10px; background: ${bg}; }
      .co-radio-card.selected { border-color: ${primary}; background: ${primary}15; }
      .co-radio-card-label { flex: 1; }
      .co-radio-card-label strong { display: block; font-size: 14px; font-weight: 600; }
      .co-radio-card-label span { font-size: 13px; opacity: 0.6; margin-top: 2px; display: block; }
      .co-btn { width: 100%; padding: 16px; background: ${primary}; color: #fff; border: none; border-radius: ${radius}; font-family: inherit; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: filter 0.2s, transform 0.15s; margin-top: 24px; }
      .co-btn:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
      .co-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
      .co-btn-ghost { background: transparent; color: ${textColor}; border: 1px solid rgba(0,0,0,0.2); }
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
      .co-notice { display: flex; gap: 12px; padding: 16px; border-radius: 10px; font-size: 13.5px; line-height: 1.6; margin-bottom: 20px; }
      .co-notice svg { flex-shrink: 0; margin-top: 2px; }
      .co-outcome { max-width: 520px; margin: 0 auto; padding: 56px 24px; text-align: center; }
      .co-outcome-ring { width: 72px; height: 72px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
      .co-outcome h1 { font-size: 26px; font-weight: 800; margin-bottom: 12px; }
      .co-outcome p { opacity: 0.7; line-height: 1.65; margin-bottom: 16px; }
      .co-ref { display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; padding: 7px 12px; border-radius: 6px; background: rgba(0,0,0,0.06); margin-bottom: 28px; }
    `}</style>
  );

  // ── Whole-page outcomes ────────────────────────────────────────────────────

  // Only while nothing is in flight. The payment outcomes below must win over an
  // availability screen — an order that has already been charged can never be
  // the right moment to tell someone the shop is closed.
  if (shopBlocked && state.kind === "form") {
    return (
      <div style={{ ...shellStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {styles}
        <div className="co-outcome">
          <div className="co-outcome-ring" style={{ background: "rgba(0,0,0,0.06)" }}>
            <LuLock size={30} style={{ opacity: 0.5 }} />
          </div>
          <h1>Checkout is closed</h1>
          <p>
            {shopBlocked === "locked"
              ? "This shop is not open to orders right now. Your cart is saved — please try again later."
              : "We could not find a shop at this address, so there is nothing to check out. Your cart is saved."}
          </p>
          <Link href="/" className="co-btn" style={{ textDecoration: "none", maxWidth: 240, margin: "0 auto" }}>
            Back to the shop
          </Link>
        </div>
      </div>
    );
  }

  if (state.kind === "paid") {
    return (
      <div style={{ ...shellStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {styles}
        <div className="co-outcome">
          <div className="co-outcome-ring" style={{ background: `${primary}20` }}>
            <LuCheck size={32} color={primary} />
          </div>
          <h1>Payment received</h1>
          <p>
            Thank you — we have your payment of <strong>{money(state.order.total_amount)}</strong>. A
            confirmation is on its way to {formData.customer_email}.
          </p>
          {state.status.reference && <div className="co-ref">{state.status.reference}</div>}
          <Link href="/" className="co-btn" style={{ textDecoration: "none", maxWidth: 260, margin: "0 auto" }}>
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  if (state.kind === "unknown") {
    // The most careful copy on the site. Real money may have moved, so this must
    // not say "failed", must not invite a second payment, and must give the
    // shopper something to quote if they need to ask.
    return (
      <div style={{ ...shellStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {styles}
        <div className="co-outcome">
          <div className="co-outcome-ring" style={{ background: "rgba(217,119,6,0.15)" }}>
            <LuClock size={30} color="#d97706" />
          </div>
          <h1>Still waiting on your provider</h1>
          <p>
            We haven&apos;t had confirmation from your mobile money provider yet.{" "}
            <strong>If you approved the payment on your phone, your money is safe</strong> — the
            order completes on its own and your receipt goes to {formData.customer_email}.
          </p>
          <p style={{ fontWeight: 600, opacity: 0.85 }}>Please don&apos;t pay again.</p>
          {state.reference && <div className="co-ref">{state.reference}</div>}
          <p style={{ fontSize: 13, opacity: 0.6 }}>
            Quote that reference if you need to contact {theme?.name || "the shop"} about this order.
          </p>
          <Link href="/" className="co-btn co-btn-ghost" style={{ textDecoration: "none", maxWidth: 260, margin: "20px auto 0" }}>
            Back to the shop
          </Link>
        </div>
      </div>
    );
  }

  if (state.kind === "awaiting") {
    const secondsLeft = Math.max(0, Math.ceil((POLL_TIMEOUT_MS - polling.elapsedMs) / 1000));
    const minutesLeft = Math.ceil(secondsLeft / 60);
    return (
      <div style={{ ...shellStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {styles}
        <div className="co-outcome">
          <div className="co-outcome-ring co-pulse" style={{ background: `${primary}20` }}>
            <LuSmartphone size={30} color={primary} />
          </div>
          <h1>Check your phone</h1>
          <p>
            We&apos;ve asked {medium ? mediumLabel(medium) : "your provider"} to charge{" "}
            <strong>{money(state.order.total_amount)}</strong> to {normaliseMsisdn(momo)}. Approve the
            prompt on your handset and this page will finish by itself — please keep it open.
          </p>
          {state.charge.reference && <div className="co-ref">{state.charge.reference}</div>}
          <p style={{ fontSize: 13, opacity: 0.55, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <LuLoader size={14} className="co-spin" />
            Waiting for confirmation
            {secondsLeft > 0 && ` — up to ${minutesLeft} more minute${minutesLeft === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>
    );
  }

  // ── The form and review ────────────────────────────────────────────────────

  const busy = state.kind === "creating" || state.kind === "charging";
  const onReview = state.kind === "review" || state.kind === "charging" || state.kind === "failed";
  const displayTotal = serverTotal !== null ? money(serverTotal) : money(cartEstimate);

  const field = (
    name: keyof typeof formData,
    label: string,
    // `wrap` styles the wrapper, not the input: a `className` here would be
    // spread over `co-input` below and strip the field of its own styling.
    { wrap, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { wrap?: string } = {}
  ) => (
    <div className={wrap}>
      <label className="co-label" htmlFor={`co-${name}`}>{label}</label>
      <input
        id={`co-${name}`}
        name={name}
        value={formData[name]}
        onChange={handleInputChange}
        disabled={onReview || busy}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `co-${name}-err` : undefined}
        {...props}
        // After the spread, so a caller cannot accidentally drop either.
        type={props.type || "text"}
        className={`co-input${errors[name] ? " invalid" : ""}`}
      />
      {errors[name] && <span className="co-err" id={`co-${name}-err`}>{errors[name]}</span>}
    </div>
  );

  return (
    <div style={shellStyle}>
      {styles}

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
        <div>
          <Link href="/" className="co-back">
            <LuArrowLeft size={16} /> Continue Shopping
          </Link>

          <div className="co-breadcrumb">
            <span>Cart</span>
            <LuChevronRight size={12} />
            <span className={onReview ? undefined : "active"}>Information &amp; Shipping</span>
            <LuChevronRight size={12} />
            <span className={onReview ? "active" : undefined}>Payment</span>
          </div>

          {/* A real form, so Enter submits and a mobile keyboard shows "Go". */}
          <form onSubmit={submitDetails} noValidate>
            <div className="co-section">
              <div className="co-section-title">
                <span className="co-step">1</span> Contact Information
              </div>
              <div className="co-grid">
                {field("customer_email", "Email Address *", {
                  wrap: "co-full",
                  type: "email",
                  inputMode: "email",
                  autoComplete: "email",
                  placeholder: "you@example.com",
                  required: true,
                })}
                {field("customer_phone", "Phone Number (Optional)", {
                  wrap: "co-full",
                  type: "tel",
                  inputMode: "tel",
                  autoComplete: "tel",
                  placeholder: "+237 6 70 00 00 00",
                })}
              </div>
            </div>

            <div className="co-section">
              <div className="co-section-title">
                <span className="co-step">2</span> Shipping Address
              </div>
              <div className="co-grid">
                {field("firstName", "First Name *", { autoComplete: "given-name", placeholder: "John", required: true })}
                {field("lastName", "Last Name *", { autoComplete: "family-name", placeholder: "Doe", required: true })}
                {field("shipping_address", "Street Address *", {
                  wrap: "co-full",
                  autoComplete: "street-address",
                  placeholder: "123 Main Street, Apt 4B",
                  required: true,
                })}
                {field("city", "City *", { autoComplete: "address-level2", placeholder: "Yaoundé", required: true })}
                {field("postal_code", "Postal Code", { autoComplete: "postal-code", placeholder: "000000" })}
              </div>
            </div>

            {!onReview && (
              <button className="co-btn" type="submit" disabled={items.length === 0 || busy}>
                {state.kind === "creating" ? (
                  <><LuLoader size={16} className="co-spin" /> Pricing your order…</>
                ) : (
                  <>Continue to Payment</>
                )}
              </button>
            )}
          </form>

          {onReview && order && (
            // Its own form, so Enter in the number field pays rather than doing
            // nothing. It cannot be part of the details form above — that one
            // submits to create the order, and nesting forms is invalid HTML.
            <form
              onSubmit={(e) => {
                e.preventDefault();
                chargeOrder(order);
              }}
              noValidate
            >
              <div className="co-section">
                <div className="co-section-title">
                  <span className="co-step">3</span> Mobile Money
                </div>

                {priceDiffers && (
                  <div className="co-notice" style={{ background: "rgba(217,119,6,0.12)", color: "#92400e" }}>
                    <LuTriangleAlert size={17} color="#d97706" />
                    <span>
                      The total has been updated to <strong>{money(serverTotal!)}</strong> — your cart
                      showed {money(cartEstimate)}. Prices are confirmed against the shop&apos;s current
                      catalogue before anything is charged.
                    </span>
                  </div>
                )}

                {state.kind === "failed" && (
                  <div className="co-notice" style={{ background: "rgba(220,38,38,0.1)", color: "#991b1b" }}>
                    <LuCircleAlert size={17} color="#dc2626" />
                    <span>{state.reason}</span>
                  </div>
                )}

                <div>
                  <label className="co-label" htmlFor="co-momo">Mobile Money Number *</label>
                  <input
                    id="co-momo"
                    className={`co-input${errors.momo ? " invalid" : ""}`}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="670 000 000"
                    value={momo}
                    disabled={busy}
                    aria-invalid={errors.momo ? true : undefined}
                    aria-describedby={errors.momo ? "co-momo-err" : "co-momo-hint"}
                    onChange={(e) => {
                      const next = e.target.value;
                      setMomo(next);
                      setErrors((prev) => (prev.momo ? { ...prev, momo: "" } : prev));
                      // Only until the shopper picks a network themselves.
                      if (!mediumChosen.current) setMedium(inferMedium(next));
                    }}
                  />
                  {errors.momo ? (
                    <span className="co-err" id="co-momo-err">{errors.momo}</span>
                  ) : (
                    <span className="co-hint" id="co-momo-hint">
                      The number holding the wallet you want to pay from.
                    </span>
                  )}
                </div>

                <div style={{ marginTop: 18 }}>
                  {/* Functional radios. These used to be decorative — no name, no
                      value, no onChange, and a hardcoded "selected" ring — so the
                      shopper's choice was discarded. */}
                  {([MEDIUM_MTN, MEDIUM_ORANGE] as PaymentMedium[]).map((m) => (
                    <label
                      key={m}
                      className={`co-radio-card${medium === m ? " selected" : ""}`}
                      htmlFor={`co-medium-${m.replace(/\s+/g, "-")}`}
                    >
                      <input
                        id={`co-medium-${m.replace(/\s+/g, "-")}`}
                        type="radio"
                        name="medium"
                        value={m}
                        checked={medium === m}
                        disabled={busy}
                        onChange={() => {
                          mediumChosen.current = true;
                          setMedium(m);
                        }}
                        style={{ accentColor: primary, width: 18, height: 18 }}
                      />
                      <LuSmartphone size={22} color={medium === m ? primary : undefined} style={medium === m ? undefined : { opacity: 0.5 }} />
                      <div className="co-radio-card-label">
                        <strong>{mediumLabel(m)}</strong>
                        <span>
                          {medium === m && !mediumChosen.current
                            ? "Detected from your number"
                            : `Pay from your ${mediumLabel(m)} wallet`}
                        </span>
                      </div>
                    </label>
                  ))}
                  <span className="co-hint">
                    Leave this as detected unless it is wrong — your provider confirms the network
                    from the number itself.
                  </span>
                </div>
              </div>

              <div className="co-section" style={{ border: `2px solid ${primary}`, background: `${primary}08` }}>
                <div className="co-section-title" style={{ marginBottom: 12 }}>
                  <span className="co-step">4</span> Review &amp; Pay
                </div>
                <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 20, lineHeight: 1.5 }}>
                  You are about to be charged <strong>{money(order.total_amount)}</strong>. A prompt
                  will appear on your phone — approve it there and this page finishes by itself.
                </p>

                <div style={{ padding: 16, background: bg, borderRadius: 8, border: "1px solid rgba(0,0,0,0.05)", marginBottom: 20, fontSize: 13, lineHeight: 1.6 }}>
                  <strong>Deliver to:</strong><br />
                  {formData.firstName} {formData.lastName}<br />
                  {formData.shipping_address}, {formData.city}<br />
                  {formData.customer_email}{formData.customer_phone && ` • ${formData.customer_phone}`}
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  {/* Going back discards this order and the next submit creates a
                      fresh one — an unpaid order left behind holds its stock
                      reservation, exactly as an abandoned tab does. That is why
                      the *common* correction, a mistyped number, is handled by
                      staying here and charging the same order again rather than
                      by sending the shopper back through this button. */}
                  <button
                    type="button"
                    className="co-btn co-btn-ghost"
                    disabled={busy}
                    onClick={() => setState({ kind: "form" })}
                    style={{ flex: 1, marginTop: 0 }}
                  >
                    Edit details
                  </button>
                  <button
                    type="submit"
                    className="co-btn"
                    disabled={busy}
                    style={{ flex: 2, marginTop: 0 }}
                  >
                    {state.kind === "charging" ? (
                      <><LuLoader size={16} className="co-spin" /> Asking your provider…</>
                    ) : (
                      <><LuLock size={16} /> Pay {money(order.total_amount)}</>
                    )}
                  </button>
                </div>
              </div>
            </form>
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
                  <div className="co-item-price">
                    {money(parseFloat(item.product.base_price) * item.quantity)}
                  </div>
                </div>
              ))}

              <hr className="co-divider" />

              <div className="co-row">
                <span>Subtotal</span>
                <span style={{ fontWeight: 600 }}>{money(cartEstimate)}</span>
              </div>
              <div className="co-row">
                <span>Shipping</span>
                <span style={{ color: primary, fontWeight: 600 }}>Calculated at delivery</span>
              </div>
              {priceDiffers && (
                <div className="co-row">
                  <span>Catalogue adjustment</span>
                  <span style={{ fontWeight: 600, color: "#d97706" }}>
                    {/* Bare number: the currency is already on every row above,
                        and stripping it back out of `money()` would break the
                        moment that helper's format changed. */}
                    {serverTotal! > cartEstimate ? "+" : "−"}
                    {Math.abs(serverTotal! - cartEstimate).toLocaleString()}
                  </span>
                </div>
              )}

              <div className="co-total">
                <span>Total</span>
                <span className="co-total-amount">{displayTotal}</span>
              </div>
              {serverTotal === null && (
                <span className="co-hint" style={{ marginTop: 10 }}>
                  Confirmed against the shop&apos;s catalogue at the next step.
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
