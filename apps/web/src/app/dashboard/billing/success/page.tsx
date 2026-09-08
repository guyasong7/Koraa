"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { LuCircleCheck, LuClock, LuLoader, LuTriangleAlert } from "react-icons/lu";
import { paymentApi } from "@/lib/api";
import { Suspense } from "react";

type Result =
  | { kind: "checking" }
  | { kind: "paid"; plan: string; reference: string }
  | { kind: "pending"; reference: string }
  | { kind: "failed" }
  | { kind: "empty" };

function BillingSuccessContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [result, setResult] = useState<Result>({ kind: "checking" });

  const transId = params.get("transId");

  useEffect(() => {
    if (!transId) {
      setResult({ kind: "empty" });
      return;
    }

    paymentApi
      .getChargeStatus(transId)
      .then((res) => {
        const d = res.data;
        if (d.settled && d.payment_status === "paid") {
          setResult({ kind: "paid", plan: d.plan, reference: d.reference });
        } else if (d.settled && d.payment_status === "failed") {
          setResult({ kind: "failed" });
        } else {
          setResult({ kind: "pending", reference: d.reference || transId });
        }
      })
      .catch(() => {
        setResult({ kind: "pending", reference: transId });
      });
  }, [transId]);

  useEffect(() => {
    if (result.kind === "paid" || result.kind === "empty") {
      const t = setTimeout(() => router.replace("/dashboard/billing"), 3000);
      return () => clearTimeout(t);
    }
  }, [result.kind, router]);

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      {result.kind === "checking" && (
        <div style={{ textAlign: "center" }}>
          <LuLoader size={32} className="spin" style={{ color: "var(--brand-600)", marginBottom: 16 }} />
          <h2 style={headingStyle}>Checking your payment</h2>
          <p style={bodyStyle}>One moment — we are confirming your payment with the provider.</p>
        </div>
      )}

      {result.kind === "paid" && (
        <div style={{ textAlign: "center" }}>
          <LuCircleCheck size={36} style={{ color: "var(--success, #16a34a)", marginBottom: 16 }} />
          <h2 style={headingStyle}>Payment received</h2>
          <p style={bodyStyle}>
            Your <strong>{result.plan}</strong> plan is now active.
          </p>
          {result.reference && <code style={refStyle}>{result.reference}</code>}
          <p style={{ ...bodyStyle, fontSize: 13, opacity: 0.6, marginTop: 16 }}>
            Redirecting to billing…
          </p>
        </div>
      )}

      {result.kind === "pending" && (
        <div style={{ textAlign: "center" }}>
          <LuClock size={36} style={{ color: "#d97706", marginBottom: 16 }} />
          <h2 style={headingStyle}>Still waiting on your provider</h2>
          <p style={bodyStyle}>
            We haven&apos;t had confirmation yet.{" "}
            <strong>If you approved the payment on your phone, your money is safe</strong>{" "}
            — the plan activates on its own, usually within a few minutes.
          </p>
          <p style={{ ...bodyStyle, fontWeight: 600 }}>Please don&apos;t pay again.</p>
          <code style={refStyle}>{result.reference}</code>
          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => router.replace("/dashboard/billing")}
              className="btn btn-primary"
              style={{ padding: "12px 28px", borderRadius: 8 }}
            >
              Go to billing
            </button>
          </div>
        </div>
      )}

      {result.kind === "failed" && (
        <div style={{ textAlign: "center" }}>
          <LuTriangleAlert size={36} style={{ color: "var(--danger, #dc2626)", marginBottom: 16 }} />
          <h2 style={headingStyle}>Payment not completed</h2>
          <p style={bodyStyle}>
            The payment was not completed. Nothing has been charged — you can try again from the billing page.
          </p>
          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => router.replace("/dashboard/billing")}
              className="btn btn-primary"
              style={{ padding: "12px 28px", borderRadius: 8 }}
            >
              Back to billing
            </button>
          </div>
        </div>
      )}

      {result.kind === "empty" && (
        <div style={{ textAlign: "center" }}>
          <p style={bodyStyle}>Redirecting to billing…</p>
        </div>
      )}
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LuLoader size={32} className="spin" style={{ color: "var(--brand-600)" }} />
        </div>
      }
    >
      <BillingSuccessContent />
    </Suspense>
  );
}

const headingStyle = {
  fontSize: 22, fontWeight: 700, margin: "0 0 10px",
  fontFamily: "var(--font-display)",
} as const;

const bodyStyle = {
  color: "var(--text-secondary)", fontSize: 15, margin: "0 0 10px",
  lineHeight: 1.55, maxWidth: 440,
} as const;

const refStyle = {
  display: "inline-block", marginTop: 8, padding: "7px 12px", fontSize: 12.5,
  background: "var(--surface-2, rgba(0,0,0,0.04))",
  borderRadius: 6, letterSpacing: "0.02em", wordBreak: "break-all" as const,
};
