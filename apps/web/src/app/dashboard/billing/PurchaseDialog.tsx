"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import {
  LuCircleCheck, LuClock, LuLoader, LuLock, LuTriangleAlert,
} from "react-icons/lu";

import { paymentApi, type BillingCycle } from "@/lib/api";
import { formatXaf } from "@/lib/planCopy";

type Stage =
  | { kind: "form" }
  | { kind: "charging" }
  | { kind: "redirecting" }
  | { kind: "paid" }
  | { kind: "failed"; reason: string }
  | { kind: "unknown"; note: string };

export interface PurchaseDialogPlan {
  key: string;
  name: string;
  price_yearly: number;
  price_monthly: number;
}

export default function PurchaseDialog({
  plan, renewal, onClose, onActivated,
}: {
  plan: PurchaseDialogPlan;
  renewal: boolean;
  onClose: () => void;
  onActivated: () => void;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [cycle, setCycle] = useState<BillingCycle>(
    ((plan as any).defaultCycle as BillingCycle) || "yearly"
  );
  const amount = cycle === "monthly" ? plan.price_monthly : plan.price_yearly;

  const busy = stage.kind === "charging" || stage.kind === "redirecting";

  const charge = async () => {
    setStage({ kind: "charging" });

    try {
      const res = await paymentApi.initiate(plan.key, cycle);

      if (res.status === 202 || !res.data.payment_url) {
        setStage({
          kind: "unknown",
          note: "We could not reach your provider to confirm the request.",
        });
        return;
      }

      setStage({ kind: "redirecting" });
      window.location.href = res.data.payment_url;
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;

      if (status === 409) {
        if (body?.settled && body?.payment_status === "paid") {
          setStage({ kind: "paid" });
          onActivated();
          return;
        }
        setStage({ kind: "failed", reason: body?.error || "A plan payment is already in progress." });
        return;
      }

      if (status === 503) {
        toast.error(
          body?.error || "We cannot reach the payment provider. Please try again in a moment.",
        );
        setStage({ kind: "form" });
        return;
      }

      const message =
        body?.error || body?.detail ||
        "That payment was refused. Please try again.";
      toast.error(message);
      setStage({ kind: "failed", reason: message });
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-panel" style={{ maxWidth: 460, borderRadius: 16 }}>
        {(stage.kind === "form" || stage.kind === "charging") && (
          <>
            <div className="modal-body" style={{ padding: 22 }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <Ring tint="var(--brand-600)">
                  <LuLock size={24} />
                </Ring>
                <h2 style={headingStyle}>
                  {renewal ? `Renew ${plan.name}` : `Pay for ${plan.name}`}
                </h2>
                <p style={{ color: "var(--text-secondary)", fontSize: 15, margin: 0, lineHeight: 1.55 }}>
                  <strong style={{ color: "var(--text-primary)" }}>
                    {formatXaf(amount)} XAF
                  </strong>{" "}
                  {cycle === "monthly" ? "for one month" : "for one year"}
                  {renewal ? ", added on to the end of your current term." : "."}
                </p>
              </div>

              <label style={labelStyle} htmlFor="plan-cycle-yearly">
                How long for
              </label>
              <div
                role="radiogroup"
                aria-label="How long to pay for"
                style={{ display: "flex", gap: 10, marginBottom: 18 }}
              >
                {(["yearly", "monthly"] as BillingCycle[]).map((option) => {
                  const on = cycle === option;
                  return (
                    <button
                      key={option}
                      id={`plan-cycle-${option}`}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={stage.kind === "charging"}
                      onClick={() => setCycle(option)}
                      style={{
                        flex: 1, padding: "10px 12px", fontSize: 13,
                        textAlign: "left", cursor: "pointer", borderRadius: 8,
                        background: on
                          ? "color-mix(in srgb, var(--brand-600) 8%, transparent)"
                          : "transparent",
                        border: `1.5px solid ${on ? "var(--brand-600)" : "var(--border)"}`,
                        color: "var(--text-primary)",
                      }}
                    >
                      <span style={{ display: "block", fontWeight: 600 }}>
                        {option === "yearly" ? "One year" : "One month"}
                      </span>
                      <span
                        style={{
                          display: "block", fontSize: 12, marginTop: 2,
                          color: on ? "var(--brand-600)" : "var(--text-muted)",
                        }}
                      >
                        {formatXaf(
                          option === "yearly" ? plan.price_yearly : plan.price_monthly,
                        )}{" "}
                        XAF{option === "yearly" ? " · 2 months free" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.5 }}>
                You will be redirected to a secure payment page to complete the
                transaction with Mobile Money.
              </p>
            </div>

            <div className="modal-footer">
              <button
                onClick={onClose}
                disabled={stage.kind === "charging"}
                className="btn btn-secondary"
                style={footerButtonStyle}
              >
                Cancel
              </button>
              <button
                onClick={charge}
                disabled={stage.kind === "charging"}
                className="btn btn-primary"
                style={{ ...footerButtonStyle, opacity: stage.kind === "charging" ? 0.8 : 1 }}
              >
                {stage.kind === "charging"
                  ? <LuLoader size={17} className="spin" />
                  : `Pay ${formatXaf(amount)} XAF`}
              </button>
            </div>
          </>
        )}

        {stage.kind === "redirecting" && (
          <Outcome
            tint="var(--brand-600)"
            icon={<LuLoader size={24} className="spin" />}
            title="Redirecting to payment"
          >
            <p style={bodyTextStyle}>
              You are being taken to a secure payment page. Please do not close this tab.
            </p>
          </Outcome>
        )}

        {stage.kind === "paid" && (
          <Outcome
            tint="var(--success, #16a34a)"
            icon={<LuCircleCheck size={24} />}
            title={renewal ? `${plan.name} renewed` : `You're on ${plan.name}`}
            footer={
              <button onClick={onClose} className="btn btn-primary" style={{ ...footerButtonStyle, flex: 1 }}>
                Done
              </button>
            }
          >
            <p style={bodyTextStyle}>
              Your payment went through and your allowances are live now
              {renewal ? " — the new term has been added to the end of your current one." : "."}
            </p>
          </Outcome>
        )}

        {stage.kind === "failed" && (
          <Outcome
            tint="var(--danger)"
            icon={<LuTriangleAlert size={24} />}
            title="That payment didn't go through"
            footer={
              <>
                <button onClick={onClose} className="btn btn-secondary" style={footerButtonStyle}>
                  Close
                </button>
                <button
                  onClick={() => setStage({ kind: "form" })}
                  className="btn btn-primary"
                  style={footerButtonStyle}
                >
                  Try again
                </button>
              </>
            }
          >
            <p style={bodyTextStyle}>{stage.reason}</p>
            <p style={{ ...bodyTextStyle, fontSize: 13, opacity: 0.75 }}>
              You have not been charged and you are still on your current plan.
            </p>
          </Outcome>
        )}

        {stage.kind === "unknown" && (
          <Outcome
            tint="#d97706"
            icon={<LuClock size={24} />}
            title="Still waiting on your provider"
            footer={
              <button onClick={onClose} className="btn btn-secondary" style={{ ...footerButtonStyle, flex: 1 }}>
                Close
              </button>
            }
          >
            <p style={bodyTextStyle}>
              {stage.note}{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                If you approved it on your phone, your money is safe
              </strong>{" "}
              — the plan activates on its own, usually within a few minutes, and
              this page will show it.
            </p>
            <p style={{ ...bodyTextStyle, fontWeight: 600 }}>Please don&apos;t pay again.</p>
          </Outcome>
        )}
      </div>
    </div>
  );
}

// ── Small shared pieces ───────────────────────────────────────────────────────

const headingStyle = {
  fontSize: 20, fontWeight: 700, margin: "0 0 8px",
  fontFamily: "var(--font-display)",
} as const;

const labelStyle = {
  display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6,
  color: "var(--text-secondary)",
} as const;

const bodyTextStyle = {
  color: "var(--text-secondary)", fontSize: 15, margin: "0 0 10px",
  lineHeight: 1.55,
} as const;

const footerButtonStyle = {
  flex: 1, minHeight: 46, padding: 12, fontSize: 15, borderRadius: 8,
  justifyContent: "center",
} as const;

function Ring({ tint, children }: { tint: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 52, height: 52, borderRadius: "50%", margin: "0 auto 14px",
        background: `color-mix(in srgb, ${tint} 13%, transparent)`,
        color: tint,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
}

function Outcome({
  tint, icon, title, reference, footer, children,
}: {
  tint: string;
  icon: React.ReactNode;
  title: string;
  reference?: string | null;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className="modal-body"
        style={{ padding: 22, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}
      >
        <Ring tint={tint}>{icon}</Ring>
        <h2 style={headingStyle}>{title}</h2>
        {children}
        {reference && (
          <code
            style={{
              marginTop: 6, padding: "7px 12px", fontSize: 12.5,
              background: "var(--surface-2, rgba(0,0,0,0.04))",
              borderRadius: 6, letterSpacing: "0.02em", wordBreak: "break-all",
            }}
          >
            {reference}
          </code>
        )}
      </div>
      {footer && <div className="modal-footer">{footer}</div>}
    </>
  );
}
