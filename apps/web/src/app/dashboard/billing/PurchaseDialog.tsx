"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  LuCircleCheck, LuClock, LuLoader, LuSmartphone, LuTriangleAlert,
} from "react-icons/lu";

import { paymentApi, type PaymentMedium, type PlanChargeStatus } from "@/lib/api";
import {
  MEDIUM_MTN, MEDIUM_ORANGE, inferMedium, isPlausibleMsisdn, mediumLabel,
  normaliseMsisdn,
} from "@/lib/momo";
import { formatXaf } from "@/lib/planCopy";
import { POLL_TIMEOUT_MS, usePaymentPolling } from "@/hooks/usePaymentPolling";

/**
 * Buying a plan, in place.
 *
 * Plans used to be paid on a Fapshi hosted page: the merchant left the dashboard,
 * paid, and came back to `/dashboard/billing/success`, whose only job was to make
 * the one status call that finished the purchase. That page is gone, and with it
 * the redirect — the merchant approves a prompt on their handset and never leaves
 * this dialog, exactly as a shopper now pays on a storefront.
 *
 * Which moves a burden onto this component. **The browser is no longer the
 * backstop.** Nothing brings the merchant back to trigger a status check, so the
 * polling here is not a nicety on top of a redirect; it is the only thing watching,
 * and the backend's reconcile sweep is what covers the merchant who closes the tab.
 * That is also why `onActivated` refetches rather than trusting the local outcome.
 *
 * The three states this has to keep straight, in the order they matter:
 *
 * 1. **Unconfirmed is not failed.** A 202, or a poll that runs out of time, means
 *    Fapshi never told us either way — the money may well have moved. Saying
 *    "failed" there invites a second payment for a year already bought, and
 *    because activation extends from the current expiry, the second one would
 *    quietly buy a *second* year rather than bouncing.
 * 2. **Refused is failed, and retryable.** A 400 charged nothing. Usually a
 *    mistyped number, so the form stays put with the message under the input.
 * 3. **Already in flight is neither.** A 409 means a prompt is already on their
 *    handset; the answer is to watch that one, never to start another.
 */

type Stage =
  | { kind: "form" }
  | { kind: "charging" }
  | { kind: "awaiting" }
  | { kind: "paid" }
  | { kind: "failed"; reason: string }
  /** A 202, or a poll that timed out. Unresolved — see the docstring. */
  | { kind: "unknown"; note: string };

export interface PurchaseDialogPlan {
  key: string;
  name: string;
  price_yearly: number;
}

export default function PurchaseDialog({
  plan, defaultPhone, renewal, onClose, onActivated,
}: {
  plan: PurchaseDialogPlan;
  /** The number on their profile, if it looks like one. Only a starting point. */
  defaultPhone?: string;
  /** True when this extends a term they already hold, which changes the copy. */
  renewal: boolean;
  onClose: () => void;
  /** Refetch the subscription. The dialog's own outcome is not the source. */
  onActivated: () => void;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [phone, setPhone] = useState(
    defaultPhone && isPlausibleMsisdn(defaultPhone) ? normaliseMsisdn(defaultPhone) : "",
  );
  const [phoneError, setPhoneError] = useState("");
  const [medium, setMedium] = useState<PaymentMedium | null>(
    defaultPhone && isPlausibleMsisdn(defaultPhone) ? inferMedium(defaultPhone) : null,
  );
  /**
   * Whether the merchant picked the network themselves. Only then is `medium`
   * sent: left off, Fapshi detects it from the number, which its own docs prefer
   * over a caller's guess and which our prefix table cannot beat.
   */
  const mediumChosen = useRef(false);

  /** The Fapshi reference. Worth quoting at support, so it outlives the polling. */
  const [reference, setReference] = useState<string | null>(null);
  const transId = useRef<string | null>(null);

  const polling = usePaymentPolling<PlanChargeStatus>({
    queryKey: ["plan-charge", transId.current],
    enabled: stage.kind === "awaiting",
    fetcher: () =>
      paymentApi.getChargeStatus(transId.current as string).then((r) => r.data),
    onPaid: () => {
      setStage({ kind: "paid" });
      onActivated();
    },
    onFailed: () =>
      setStage({
        kind: "failed",
        reason: "Your provider did not complete the payment. Nothing has been charged.",
      }),
    // Not a failure. A charge still pending after three minutes may yet land, and
    // the reconcile sweep will finish it whether or not this tab is open.
    onTimeout: () =>
      setStage({
        kind: "unknown",
        note: "Your provider has not confirmed the payment yet.",
      }),
  });

  /** True while money may be moving, which is when closing must be refused. */
  const busy = stage.kind === "charging" || stage.kind === "awaiting";

  const charge = async () => {
    if (!isPlausibleMsisdn(phone)) {
      setPhoneError("Enter a mobile money number — nine digits starting with 6.");
      return;
    }
    setPhoneError("");
    setStage({ kind: "charging" });

    try {
      const res = await paymentApi.initiate(plan.key, "yearly", {
        phone: normaliseMsisdn(phone),
        ...(mediumChosen.current && medium ? { medium } : {}),
      });

      if (res.status === 202 || res.data.charge_accepted === false) {
        // Fapshi never answered. There is no `trans_id`, so there is nothing to
        // poll and nothing this dialog can resolve — only a human at the Fapshi
        // dashboard can. Must not be retried automatically.
        setStage({
          kind: "unknown",
          note: "We could not reach your provider to confirm the request.",
        });
        return;
      }

      transId.current = res.data.trans_id ?? null;
      setReference(transId.current);
      setStage({ kind: "awaiting" });
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;

      // 409 — a plan payment of theirs is already unsettled, and the backend
      // settled it before answering. Two shapes, and neither means "charge again".
      if (status === 409) {
        if (body?.settled && body?.payment_status === "paid") {
          // It had already gone through; asking to buy activated it. Their plan
          // is live, so this is a success, not a conflict.
          setStage({ kind: "paid" });
          onActivated();
          return;
        }
        if (body?.trans_id) {
          // A prompt is already on their handset. Watch that charge rather than
          // starting a second one — the whole point of the backend's guard.
          transId.current = body.trans_id;
          setReference(body.trans_id);
          setStage({ kind: "awaiting" });
          toast(body?.error || "A plan payment is already waiting for your approval.");
          return;
        }
        setStage({ kind: "failed", reason: body?.error || "A plan payment is already in progress." });
        return;
      }

      // 503 — Fapshi is unreachable, so whether an earlier attempt of theirs is
      // live is unknown and the backend refused rather than risk a double charge.
      // Nothing was charged *now*, so the form is the right place to land.
      if (status === 503) {
        toast.error(
          body?.error || "We cannot reach the payment provider. Please try again in a moment.",
        );
        setStage({ kind: "form" });
        return;
      }

      // 400 — refused, nothing charged, and usually a number they can fix.
      const fieldError = Array.isArray(body?.phone) ? body.phone[0] : null;
      setPhoneError(
        fieldError || body?.error || body?.detail ||
        "That payment was refused. Check the number and try again.",
      );
      setStage({ kind: "form" });
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        // Not dismissable while a charge is live: closing would hide whether the
        // merchant's money moved, and there is no second place to find out.
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-panel" style={{ maxWidth: 460, borderRadius: 16 }}>
        {stage.kind === "form" || stage.kind === "charging" ? (
          <>
            <div className="modal-body" style={{ padding: 22 }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <Ring tint="var(--brand-600)">
                  <LuSmartphone size={24} />
                </Ring>
                <h2 style={headingStyle}>
                  {renewal ? `Renew ${plan.name}` : `Pay for ${plan.name}`}
                </h2>
                <p style={{ color: "var(--text-secondary)", fontSize: 15, margin: 0, lineHeight: 1.55 }}>
                  <strong style={{ color: "var(--text-primary)" }}>
                    {formatXaf(plan.price_yearly)} XAF
                  </strong>{" "}
                  for one year
                  {renewal ? ", added on to the end of your current term." : "."}
                </p>
              </div>

              <label style={labelStyle} htmlFor="plan-momo">
                Mobile money number
              </label>
              <input
                id="plan-momo"
                className="input"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="6XXXXXXXX"
                value={phone}
                disabled={stage.kind === "charging"}
                onChange={(e) => {
                  const next = e.target.value.replace(/[^\d+ ]/g, "");
                  setPhone(next);
                  setPhoneError("");
                  // Follows the number until they override it themselves.
                  if (!mediumChosen.current) setMedium(inferMedium(next));
                }}
                onKeyDown={(e) => { if (e.key === "Enter" && stage.kind === "form") charge(); }}
              />
              {phoneError && (
                <p style={{ color: "var(--danger-text)", fontSize: 13, margin: "6px 0 0" }}>
                  {phoneError}
                </p>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                {([MEDIUM_MTN, MEDIUM_ORANGE] as PaymentMedium[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={stage.kind === "charging"}
                    onClick={() => { mediumChosen.current = true; setMedium(m); }}
                    style={{
                      flex: 1, padding: "11px 12px", fontSize: 13, fontWeight: 600,
                      textAlign: "left", cursor: "pointer", borderRadius: 8,
                      background: medium === m ? "color-mix(in srgb, var(--brand-600) 8%, transparent)" : "transparent",
                      border: `1.5px solid ${medium === m ? "var(--brand-600)" : "var(--border)"}`,
                      color: "var(--text-primary)",
                      display: "flex", alignItems: "center", gap: 8,
                    }}
                  >
                    <LuSmartphone
                      size={17}
                      color={medium === m ? "var(--brand-600)" : undefined}
                      style={medium === m ? undefined : { opacity: 0.45 }}
                    />
                    {mediumLabel(m)}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "12px 0 0", lineHeight: 1.5 }}>
                A prompt appears on your phone. Approve it there and this window
                finishes by itself — please keep it open.
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
                  : `Pay ${formatXaf(plan.price_yearly)} XAF`}
              </button>
            </div>
          </>
        ) : null}

        {stage.kind === "awaiting" && (
          <Outcome
            tint="var(--brand-600)"
            icon={<LuSmartphone size={24} />}
            title="Check your phone"
            reference={reference}
          >
            <p style={bodyTextStyle}>
              We&apos;ve asked {medium ? mediumLabel(medium) : "your provider"} to charge{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {formatXaf(plan.price_yearly)} XAF
              </strong>{" "}
              to {normaliseMsisdn(phone)}. Approve the prompt on your handset — this
              window finishes by itself.
            </p>
            <p style={{ ...bodyTextStyle, fontSize: 13, opacity: 0.7, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <LuLoader size={14} className="spin" />
              Waiting for confirmation
              {(() => {
                const left = Math.ceil(
                  Math.max(0, POLL_TIMEOUT_MS - polling.elapsedMs) / 60_000,
                );
                return left > 0 ? ` — up to ${left} more minute${left === 1 ? "" : "s"}` : "";
              })()}
            </p>
          </Outcome>
        )}

        {stage.kind === "paid" && (
          <Outcome
            tint="var(--success, #16a34a)"
            icon={<LuCircleCheck size={24} />}
            title={renewal ? `${plan.name} renewed` : `You're on ${plan.name}`}
            reference={reference}
            footer={
              <button onClick={onClose} className="btn btn-primary" style={{ ...footerButtonStyle, flex: 1 }}>
                Done
              </button>
            }
          >
            <p style={bodyTextStyle}>
              Your payment went through and your allowances are live now
              {renewal ? " — the year has been added to the end of your term." : "."}
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
                  onClick={() => { transId.current = null; setReference(null); setStage({ kind: "form" }); }}
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
          // The most careful copy on this screen. Real money may have moved, so it
          // must not say "failed", must not offer to pay again, and must give them
          // something to quote.
          <Outcome
            tint="#d97706"
            icon={<LuClock size={24} />}
            title="Still waiting on your provider"
            reference={reference}
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
            {!reference && (
              <p style={{ ...bodyTextStyle, fontSize: 13, opacity: 0.75 }}>
                If nothing changes within the hour, contact support with the number
                you paid from — {normaliseMsisdn(phone)}.
              </p>
            )}
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

/** A terminal (or waiting) screen: ring, heading, prose, reference, footer. */
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
