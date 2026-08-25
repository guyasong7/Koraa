"use client";
import { useState } from "react";
import { paymentApi, type SubscriptionState } from "@/lib/api";
import {
  CONTACT_SALES_PLAN, POPULAR_PLAN, formatXaf, planBullets,
} from "@/lib/planCopy";
import toast from "react-hot-toast";
import {
  LuCheck, LuZap, LuStar, LuBuilding, LuShield, LuTriangleAlert,
  LuRotateCcw, LuLoader,
} from "react-icons/lu";
import { useQuery } from "@tanstack/react-query";

/**
 * Presentation only. Every price, limit and feature flag comes from
 * `/payments/plans/`, which serves `apps/merchants/plans.py` — the catalogue
 * this screen used to duplicate, and disagree with: it advertised 5,000
 * XAF/month plans that the backend refused to sell, and product ceilings the
 * enforcement code had already raised.
 *
 * The wording of a bullet, which tier is badged and which one is sold by
 * conversation all live in `lib/planCopy`, shared with the marketing pricing
 * table — the other place this catalogue is rendered, and the one it had
 * already drifted away from.
 */
const PLAN_CHROME: Record<string, { color: string; icon: typeof LuShield; cta: string }> = {
  free:       { color: "#6b7280",         icon: LuShield,   cta: "Get Started Free" },
  starter:    { color: "#3b82f6",         icon: LuZap,      cta: "Start Selling" },
  pro:        { color: "var(--brand-600)", icon: LuStar,     cta: "Go Pro" },
  enterprise: { color: "var(--text-primary)", icon: LuBuilding, cta: "Contact Sales" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export default function BillingPage() {
  const [loading, setLoading] = useState<string | null>(null);

  const { data: catalogue, isLoading: plansLoading } = useQuery({
    queryKey: ["plan-catalogue"],
    queryFn: () => paymentApi.getPlans().then(r => r.data),
  });
  const { data: sub, refetch: refetchSub } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => paymentApi.getSubscription().then(r => r.data),
  });

  const state: Partial<SubscriptionState> = sub ?? {};
  const currentPlan = state.plan || "free";

  const handleSubscribe = async (planKey: string) => {
    if (planKey === CONTACT_SALES_PLAN) {
      window.location.href = "mailto:sales@koraa.africa?subject=Enterprise Plan Enquiry";
      return;
    }
    setLoading(planKey);
    try {
      if (planKey === "free") {
        await paymentApi.initiate("free", "yearly");
        await refetchSub();
        toast.success("You are on the Free plan.");
        return;
      }
      // Yearly only: `PURCHASABLE_CYCLES` rejects anything else, which is why
      // the monthly toggle that used to sit here 400'd on every click.
      const res = await paymentApi.initiate(planKey, "yearly");
      window.location.href = res.data.payment_url;
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Payment initiation failed.");
    } finally {
      setLoading(null);
    }
  };

  const plans = catalogue?.plans ?? [];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ marginBottom: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, fontFamily: "Outfit, sans-serif", marginBottom: 10 }}>
          Choose Your Plan
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 17, marginBottom: 8 }}>
          Every plan is billed yearly, in XAF, by MTN MoMo or Orange Money.
        </p>
      </div>

      {/* Expiry notice. Shown from a week out, and again once a term has
          lapsed — the plan cards stay live either way so renewing is one
          click rather than a support ticket. */}
      {(state.expiring_soon || state.is_expired || (currentPlan === "free" && state.previous_plan)) && (
        <div
          style={{
            display: "flex", alignItems: "flex-start", gap: 14,
            padding: "18px 22px", marginBottom: 32,
            background: state.expiring_soon && !state.is_expired ? "rgba(245,158,11,0.08)" : "rgba(239,68,68,0.07)",
            border: `1px solid ${state.expiring_soon && !state.is_expired ? "rgba(245,158,11,0.25)" : "rgba(239,68,68,0.22)"}`,
          }}
        >
          {state.expiring_soon && !state.is_expired
            ? <LuTriangleAlert size={20} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
            : <LuRotateCcw size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />}
          <div>
            <p style={{ fontWeight: 700, fontSize: 16, margin: "0 0 4px" }}>
              {state.expiring_soon && !state.is_expired
                ? `Your plan expires in ${state.days_remaining} day${state.days_remaining === 1 ? "" : "s"}`
                : `Your ${(state.previous_plan || state.purchased_plan || "paid").replace(/^\w/, c => c.toUpperCase())} plan has expired`}
            </p>
            <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0 }}>
              {state.expiring_soon && !state.is_expired
                ? `Renew before ${formatDate(state.term_ends_at ?? null)} and nothing about your shop changes.`
                : `Your account is on the Free plan${state.previous_plan_ended_at ? ` since ${formatDate(state.previous_plan_ended_at)}` : ""}. Your storefronts stay online and nothing has been deleted — pick a plan below to restore your allowances.`}
            </p>
          </div>
        </div>
      )}

      {plansLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
          <LuLoader size={28} className="spin" color="var(--brand-500)" />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {plans.map(plan => {
            const chrome = PLAN_CHROME[plan.key] ?? { color: "#6b7280", icon: LuShield, cta: "Choose plan" };
            const isCurrentPlan = currentPlan === plan.key;
            const isPro = plan.key === POPULAR_PLAN;
            const isContact = plan.key === CONTACT_SALES_PLAN;
            // A current *paid* plan stays clickable: renewing early extends
            // the term rather than replacing it, and a merchant whose plan
            // just lapsed must be able to buy the same one again. Only Free
            // — which cannot be bought and never expires — is inert.
            const inert = isCurrentPlan && plan.key === "free";
            const label = isCurrentPlan
              ? plan.key === "free" ? "Current Plan" : state.expiring_soon ? "Renew now" : "Renew early"
              : state.previous_plan === plan.key ? `Reactivate ${plan.name}` : chrome.cta;

            return (
              <div
                key={plan.key}
                style={{
                  background: isPro ? "#1a1a1a" : "white",
                  border: isPro ? "none" : isCurrentPlan ? "1.5px solid var(--brand-600)" : "1px solid var(--border)",
                  padding: "32px 28px",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                }}
              >
                {isPro && (
                  <div style={{
                    position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                    background: "var(--brand-600)", color: "#fff", fontSize: 12, fontWeight: 700,
                    padding: "4px 14px", letterSpacing: "0.06em", textTransform: "uppercase",
                  }}>
                    Most Popular
                  </div>
                )}
                {isCurrentPlan && plan.key !== "free" && (
                  <div style={{
                    position: "absolute", top: 14, right: 14,
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                    color: isPro ? "var(--brand-400)" : "var(--brand-600)",
                  }}>
                    Your plan
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{
                    width: 38, height: 38, background: `${chrome.color}15`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <chrome.icon size={19} color={chrome.color} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: isPro ? "#fff" : "var(--text-primary)", fontFamily: "Outfit, sans-serif", marginBottom: 0 }}>
                      {plan.name}
                    </h3>
                    <p style={{ fontSize: 13, color: isPro ? "rgba(255,255,255,0.5)" : "var(--text-muted)", margin: 0 }}>
                      {plan.tagline}
                    </p>
                  </div>
                </div>

                <div style={{ marginBottom: 24 }}>
                  {plan.price_yearly === 0 ? (
                    <span style={{ fontSize: 38, fontWeight: 800, fontFamily: "Outfit, sans-serif", color: isPro ? "#fff" : "var(--text-primary)" }}>Free</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 38, fontWeight: 800, fontFamily: "Outfit, sans-serif", color: isPro ? "#fff" : "var(--text-primary)" }}>
                        {formatXaf(plan.price_yearly)}
                      </span>
                      <span style={{ fontSize: 15, color: isPro ? "rgba(255,255,255,0.6)" : "var(--text-muted)", marginLeft: 4 }}>
                        XAF/yr
                      </span>
                    </>
                  )}
                </div>

                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                  {planBullets(plan).map(f => (
                    <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14, color: isPro ? "rgba(255,255,255,0.8)" : "var(--text-secondary)" }}>
                      <LuCheck size={15} color={isPro ? "var(--brand-400)" : "var(--brand-600)"} style={{ marginTop: 2, flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.key)}
                  disabled={inert || loading === plan.key}
                  style={{
                    padding: "13px 20px", fontSize: 14, fontWeight: 700,
                    background: inert ? "transparent" : isPro ? "var(--brand-600)" : isContact ? "#1a1a1a" : "white",
                    color: inert ? "var(--text-muted)" : isPro || isContact ? "#fff" : "var(--text-primary)",
                    border: inert ? "1px solid var(--border)" : isPro ? "none" : isContact ? "none" : "1.5px solid var(--border)",
                    cursor: inert ? "default" : "pointer",
                    transition: "all 0.2s",
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  {loading === plan.key ? "Redirecting…" : label}
                </button>

                {isCurrentPlan && plan.key !== "free" && state.term_ends_at && (
                  <p style={{ fontSize: 12, color: isPro ? "rgba(255,255,255,0.5)" : "var(--text-muted)", textAlign: "center", margin: "10px 0 0" }}>
                    {state.is_expired
                      ? `Expired ${formatDate(state.term_ends_at)}`
                      : `Runs until ${formatDate(state.term_ends_at)} — renewing adds a year to that`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
