"use client";
import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { paymentApi } from "@/lib/api";
import { LuLoader } from "react-icons/lu";
import { FiCheckCircle, FiXCircle } from "react-icons/fi";
import Link from "next/link";

function SuccessContent() {
  const params = useSearchParams();
  const transId = params.get("transId") || params.get("trans_id") || "";
  const [state, setState] = useState<"loading" | "success" | "failed" | "pending">("loading");
  const [plan, setPlan] = useState("");

  useEffect(() => {
    if (!transId) { setState("failed"); return; }
    paymentApi.verifyCallback(transId)
      .then(res => {
        setState(
          res.data.status === "activated" ? "success" :
          res.data.status === "failed" ? "failed" : "pending"
        );
        if (res.data.plan) setPlan(res.data.plan);
      })
      .catch(() => setState("failed"));
  }, [transId]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface)" }}>
      <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)", padding: "64px 48px", textAlign: "center", maxWidth: 480, width: "100%" }}>

        {state === "loading" && (
          <>
            <LuLoader size={48} className="spin" color="var(--brand-600)" style={{ margin: "0 auto 24px" }} />
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, fontFamily: "Outfit, sans-serif" }}>Verifying payment…</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Please wait while we confirm your transaction with Fapshi.</p>
          </>
        )}

        {state === "success" && (
          <>
            <FiCheckCircle size={56} color="#22c55e" style={{ margin: "0 auto 24px", display: "block" }} />
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, fontFamily: "Outfit, sans-serif" }}>Payment Successful!</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 15, marginBottom: 32 }}>
              Your <strong style={{ color: "var(--brand-600)", textTransform: "capitalize" }}>{plan}</strong> plan is now active. Welcome to the full Koraa experience!
            </p>
            <Link href="/dashboard" className="btn btn-primary btn-full">Go to Dashboard</Link>
          </>
        )}

        {state === "failed" && (
          <>
            <FiXCircle size={56} color="#ef4444" style={{ margin: "0 auto 24px", display: "block" }} />
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, fontFamily: "Outfit, sans-serif" }}>Payment Failed</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 15, marginBottom: 32 }}>
              Something went wrong with your payment. No charges were applied. Please try again.
            </p>
            <Link href="/dashboard/billing" className="btn btn-primary btn-full">Try Again</Link>
          </>
        )}

        {state === "pending" && (
          <>
            <LuLoader size={48} color="#f59e0b" style={{ margin: "0 auto 24px", display: "block" }} />
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, fontFamily: "Outfit, sans-serif" }}>Payment Pending</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 15, marginBottom: 32 }}>
              Your payment is still being processed. We will notify you once confirmed.
            </p>
            <Link href="/dashboard" className="btn btn-secondary btn-full">Back to Dashboard</Link>
          </>
        )}

      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface)" }}>
        <LuLoader size={48} className="spin" color="var(--brand-600)" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
