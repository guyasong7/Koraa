"use client";
import { useState } from "react";
import {
  paymentApi, type PlanCatalogueEntry, type SubscriptionState,
} from "@/lib/api";
import {
  CONTACT_SALES_PLAN, POPULAR_PLAN, formatXaf, planBullets,
} from "@/lib/planCopy";
import { useAuthStore } from "@/stores/auth";
import PurchaseDialog from "./PurchaseDialog";
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

/**
 * Confirms giving up a paid term for Free.
 *
 * The free branch of `InitiatePaymentView` cancels every active subscription
 * and sets `tier_expires_at` to null (backend/apps/payments/views.py). The paid
 * term is destroyed outright — not archived, not pro-rated, not refunded — and
 * nothing short of buying another term brings it back.
 *
 * Until this dialog existed, a merchant halfway through a Pro year saw the Free
 * card as an ordinary enabled button reading "Get Started Free". One click and
 * the rest of the year was gone, with no warning and no way back. So the guard
 * is not only that a confirmation exists, but that the button stops describing
 * a downgrade as a sign-up — see `label` below.
 */
function DowngradeDialog({
  planName, daysRemaining, termEndsAt, busy, onCancel, onConfirm,
}: {
  planName: string;
  daysRemaining: number;
  termEndsAt: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="modal-panel" style={{ maxWidth: 440, borderRadius: "16px" }}>
        <div className="modal-body" style={{ padding: "22px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger-text)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <LuTriangleAlert size={24} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 10px 0", fontFamily: "var(--font-display)" }}>
            Give up the rest of your {planName} term?
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 15, margin: "0 0 12px 0", lineHeight: 1.55 }}>
            You have{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {daysRemaining} day{daysRemaining === 1 ? "" : "s"}
            </strong>{" "}
            of {planName} left{termEndsAt ? `, paid up to ${formatDate(termEndsAt)}` : ""}.
            Switching to Free ends that immediately.
          </p>
          <p style={{ color: "var(--text-secondary)", fontSize: 15, margin: 0, lineHeight: 1.55 }}>
            This cannot be undone and the unused time is not refunded — getting
            {" "}{planName} back means paying for a whole new term. Your storefronts
            and data stay online either way; only your allowances drop to the
            Free limits.
          </p>
        </div>

        <div className="modal-footer">
          <button onClick={onCancel} className="btn btn-secondary" style={{ flex: 1, minHeight: 46, padding: "12px", fontSize: 15, borderRadius: "8px", justifyContent: "center" }}>
            Keep {planName}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="btn btn-primary"
            style={{
              flex: 1, minHeight: 46, padding: "12px", fontSize: 15, borderRadius: "8px", justifyContent: "center",
              background: "var(--danger)",
              color: "#fff",
              borderColor: "transparent",
              opacity: busy ? 0.8 : 1,
              transition: "all 0.2s",
            }}
          >
            {busy ? <LuLoader size={17} className="spin" /> : "Downgrade anyway"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  /** Set when Free is clicked from a paid plan — see `DowngradeDialog`. */
  const [confirmingDowngrade, setConfirmingDowngrade] = useState(false);
  /**
   * The plan being paid for, if any. Purchases happen in `PurchaseDialog` now:
   * plans are charged on the handset in place, so there is no hosted page to
   * send the merchant to and no return trip to bring them back.
   */
  const [buying, setBuying] = useState<PlanCatalogueEntry | null>(null);
  /** Only to prefill the number field. The merchant can pay from any wallet. */
  const profilePhone = useAuthStore(s => s.user?.phone);

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

  const handleSubscribe = async (plan: PlanCatalogueEntry) => {
    if (plan.key === CONTACT_SALES_PLAN) {
      window.location.href = "mailto:sales@koraa.cm?subject=Enterprise Plan Enquiry";
      return;
    }
    // Free is not a purchase, it is the end of one. Ask before spending the
    // rest of a paid term; `performDowngrade` is what actually does it.
    if (plan.key === "free") {
      // The card is inert when Free is already the effective tier, so getting
      // here means a live paid term. Guarded anyway, because `plan` also reads
      // "free" once a term lapses and there is nothing to give up in that case.
      if (currentPlan === "free") return;
      setConfirmingDowngrade(true);
      return;
    }
    // The cycle is chosen in the dialog, which is the only thing that calls
    // `initiate`. It used to be fixed at yearly here because a monthly toggle
    // on this page 400'd on every click; both cycles sell now, and the choice
    // sits next to the amount it changes rather than two screens away from it.
    setBuying(plan);
  };

  /** The confirmed downgrade. Only `DowngradeDialog` reaches this. */
  const performDowngrade = async () => {
    setLoading("free");
    try {
      await paymentApi.initiate("free", "yearly");
      await refetchSub();
      setConfirmingDowngrade(false);
      toast.success("You are now on the Free plan.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not switch to the Free plan.");
    } finally {
      setLoading(null);
    }
  };

  const plans = catalogue?.plans ?? [];
  // Taken from the catalogue rather than title-casing the key, so the dialog
  // calls the plan what its card calls it.
  const currentPlanName =
    plans.find(p => p.key === currentPlan)?.name
    ?? currentPlan.replace(/^\w/, c => c.toUpperCase());

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ marginBottom: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, fontFamily: "Outfit, sans-serif", marginBottom: 10 }}>
          Choose Your Plan
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 17, marginBottom: 8 }}>
          Pay by the year or by the month, in XAF, by MTN MoMo or Orange Money.
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
            // Free reached from a paid plan must not read "Get Started Free".
            // That describes signing up; what the button does is end the term
            // the merchant paid for. See `DowngradeDialog`.
            const label = isCurrentPlan
              ? plan.key === "free" ? "Current Plan" : state.expiring_soon ? "Renew now" : "Renew early"
              : plan.key === "free" ? "Downgrade to Free"
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
                      {/* The other cycle, so the annual headline does not read
                          as the only way to pay. Which one is bought is settled
                          in `PurchaseDialog`, next to the amount it changes. */}
                      <p style={{ fontSize: 13, margin: "6px 0 0", color: isPro ? "rgba(255,255,255,0.55)" : "var(--text-muted)" }}>
                        or {formatXaf(plan.price_monthly)} XAF a month
                      </p>
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
                  onClick={() => handleSubscribe(plan)}
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
                  {/* Only the Free downgrade is awaited inline; a purchase opens
                      the dialog immediately and reports its own progress. */}
                  {loading === plan.key ? "Switching…" : label}
                </button>

                {isCurrentPlan && plan.key !== "free" && state.term_ends_at && (
                  <p style={{ fontSize: 12, color: isPro ? "rgba(255,255,255,0.5)" : "var(--text-muted)", textAlign: "center", margin: "10px 0 0" }}>
                    {state.is_expired
                      ? `Expired ${formatDate(state.term_ends_at)}`
                      : `Runs until ${formatDate(state.term_ends_at)} — renewing adds to that rather than replacing it`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {buying && (
        <PurchaseDialog
          plan={buying}
          defaultPhone={profilePhone}
          // Renewing extends the term rather than replacing it, and the dialog
          // says so — a merchant with six months left needs to know the new
          // term is added on, not that they are starting over. How much is
          // added depends on the cycle they pick, which is why neither this
          // screen nor the card above names a fixed length.
          renewal={currentPlan === buying.key && !state.is_expired}
          onClose={() => setBuying(null)}
          // The dialog's own outcome is not the authority on what they hold now:
          // the poll it settled on could be a moment behind the activation, and
          // usage allowances read off this query.
          onActivated={() => { void refetchSub(); }}
        />
      )}

      {confirmingDowngrade && (
        <DowngradeDialog
          planName={currentPlanName}
          daysRemaining={state.days_remaining ?? 0}
          termEndsAt={state.term_ends_at ?? null}
          busy={loading === "free"}
          // Not dismissable mid-request: the call is already in flight, and
          // closing would hide whether it landed.
          onCancel={() => { if (loading !== "free") setConfirmingDowngrade(false); }}
          onConfirm={performDowngrade}
        />
      )}
    </div>
  );
}
