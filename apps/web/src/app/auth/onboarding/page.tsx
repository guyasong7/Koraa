"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { merchantApi } from "@/lib/api";
import KoraaLogo from "@/components/KoraaLogo";
import toast from "react-hot-toast";
import { LuArrowRight, LuArrowLeft, LuCheck, LuStore, LuSparkles } from "react-icons/lu";

/**
 * The emoji is split out of the label rather than sitting inside the
 * string, so the tile can size and space it on its own. Baked into the
 * text it inherited the label's 13px and sat on the text baseline, which
 * on Android renders it a good deal smaller than the surrounding glyphs.
 */
const BUSINESS_TYPES = [
  { value: "retail", emoji: "🛍️", label: "Retail" },
  { value: "fashion", emoji: "👗", label: "Fashion & Apparel" },
  { value: "beauty", emoji: "💄", label: "Beauty" },
  { value: "food", emoji: "🍽️", label: "Food & Drink" },
  { value: "electronics", emoji: "📱", label: "Electronics" },
  { value: "digital", emoji: "💻", label: "Digital" },
  { value: "services", emoji: "⚡", label: "Services" },
  { value: "other", emoji: "📦", label: "Other" },
];

const COUNTRIES = [
  { value: "CM", label: "🇨🇲 Cameroon" },
];

const STEPS = ["Your business", "Where to find you"];

interface Form {
  business_name: string;
  business_type: string;
  phone: string;
  country: string;
  city: string;
}

/**
 * Mirrors the slug the backend derives, well enough for a preview. It is
 * deliberately not authoritative — the real slug is assigned on create
 * and may gain a suffix if it collides — so this only ever feeds the
 * decorative chip over the photo, never a link or a form value.
 */
function previewSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<Form>({
    business_name: "",
    business_type: "retail",
    phone: "",
    country: "CM",
    city: "",
  });

  useEffect(() => {
    if (user && user.has_merchant) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await merchantApi.onboard(form);
      await useAuthStore.getState().fetchMe();
      toast.success("Business profile created!");
      setStep(2);
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (err: any) {
      const data = err?.response?.data || {};
      const msg = data.non_field_errors?.[0]
        || data.business_name?.[0]
        || data.detail
        || (typeof data === 'string' ? data : "Something went wrong.");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const firstName = user?.full_name?.split(" ")[0] || "there";
  const chosenType = BUSINESS_TYPES.find((b) => b.value === form.business_type);
  const slug = previewSlug(form.business_name);

  return (
    <div className="auth-split-shell">
      <div className="auth-split">
        <div className="auth-split__form">
          <div className="auth-split__brand">
            <KoraaLogo className="auth-logo" />
          </div>

          <div className="auth-split__head">
            {step < 2 && (
              <span className="auth-split__eyebrow">Welcome, {firstName} 👋</span>
            )}
            <h1 className="auth-split__title">
              {step === 2 ? "Your shop is ready" : "Let's set up your shop"}
            </h1>
            <p className="auth-split__sub">
              {step === 0 && "Two short steps. You can change any of this later."}
              {step === 1 && "Last one — where should customers reach you?"}
              {step === 2 && "Taking you to your dashboard…"}
            </p>
          </div>

          {step < 2 && (
            <ol className="auth-split__steps">
              {STEPS.map((label, i) => (
                <li key={label} data-reached={i <= step}>
                  {label}
                </li>
              ))}
            </ol>
          )}

          {step === 0 && (
            <>
              <div className="auth-split__field">
                <label className="auth-split__label" htmlFor="business_name">
                  What is your business called?
                </label>
                <input
                  id="business_name"
                  type="text"
                  className="input"
                  placeholder="e.g. Ama Fashion House"
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="auth-split__field">
                <label className="auth-split__label">What do you sell?</label>
                <div className="auth-split__tiles">
                  {BUSINESS_TYPES.map((bt) => (
                    <button
                      key={bt.value}
                      type="button"
                      className="auth-split__tile"
                      /* A group of these is a set of choices, not eight
                         independent switches — but `aria-pressed` is what
                         carries the selected state visually here, so it has
                         to be the truthful one. */
                      aria-pressed={form.business_type === bt.value}
                      onClick={() => setForm({ ...form, business_type: bt.value })}
                    >
                      <span className="auth-split__tile-emoji" aria-hidden="true">{bt.emoji}</span>
                      {bt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="auth-split__btn auth-split__btn--primary"
                onClick={() => form.business_name.trim() && setStep(1)}
                disabled={!form.business_name.trim()}
                style={{ marginTop: 10 }}
              >
                Continue <LuArrowRight size={17} />
              </button>
            </>
          )}

          {step === 1 && (
            /* A form, so Enter submits. The previous version was loose divs
               with a click handler, which meant the only way to finish was
               to reach for the mouse. */
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!loading) void handleSubmit();
              }}
            >
              <div className="auth-split__row">
                <div className="auth-split__field">
                  <label className="auth-split__label" htmlFor="country">Country</label>
                  <select
                    id="country"
                    className="input"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="auth-split__field">
                  <label className="auth-split__label" htmlFor="city">City</label>
                  <input
                    id="city"
                    type="text"
                    className="input"
                    placeholder="e.g. Douala"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    autoFocus
                  />
                </div>
              </div>

              <div className="auth-split__field">
                <label className="auth-split__label" htmlFor="business_phone">
                  Business phone
                </label>
                <input
                  id="business_phone"
                  type="tel"
                  className="input"
                  placeholder="+237 600 000 000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>

              <div className="auth-split__actions">
                <button
                  type="button"
                  className="auth-split__btn auth-split__btn--ghost"
                  onClick={() => setStep(0)}
                >
                  <LuArrowLeft size={16} /> Back
                </button>
                <button
                  type="submit"
                  className="auth-split__btn auth-split__btn--primary"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="spin-fast"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 60" /></svg>
                      Creating…
                    </>
                  ) : (
                    <>
                      <LuSparkles size={17} /> Launch my shop
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className="auth-split__done">
              <div className="auth-split__done-mark">
                <LuCheck size={34} />
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: 15, margin: 0 }}>
                {form.business_name.trim() || "Your shop"} is set up. Next stop:
                your first product.
              </p>
            </div>
          )}
        </div>

        {/* Photo column. The chips over it track what has been typed, so the
            picture reacts to the form instead of sitting beside it — which is
            most of why the reference's overlaid cards work. */}
        <div className="auth-split__aside" aria-hidden="true">
          <div
            className="auth-split__photo"
            style={{
              "--auth-photo": "url('/images/founder-welcome.jpg')",
              /* Framed tighter than the register portrait: this one is a
                 head-and-shoulders studio shot, so the default 16% crop cuts
                 the top of her hair. */
              "--auth-photo-pos": "50% 28%",
            } as React.CSSProperties}
          >
            <div className="auth-split__float auth-split__float--pay">
              <div
                style={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--brand-tint)",
                  border: "1px solid var(--brand-tint-border)",
                  color: "var(--brand-text)",
                }}
              >
                <LuStore size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <p className="auth-split__float-label">Your storefront</p>
                <p
                  className="auth-split__float-value"
                  /* The name is user input of unbounded length, and this chip
                     hangs off the card's left edge — without the clamp a long
                     one pushes out over the form column. 215px is what the
                     untouched placeholder needs; below that the chip opens
                     already truncated, which reads as a rendering fault. */
                  style={{ maxWidth: 215, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {slug ? `koraa.shop/${slug}` : "koraa.shop/your-name"}
                </p>
              </div>
            </div>

            <div className="auth-split__float auth-split__float--stat">
              <span className="auth-split__tile-emoji" style={{ fontSize: "1.25rem" }}>
                {chosenType?.emoji ?? "🛍️"}
              </span>
              <div>
                <p className="auth-split__float-label">Selling</p>
                <p className="auth-split__float-value">{chosenType?.label ?? "Retail"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
