"use client";

import Link from "next/link";
import { useState } from "react";
import { LuArrowLeft, LuArrowRight, LuMailCheck } from "react-icons/lu";
import { sendPasswordReset } from "@/lib/firebase";
import KoraaLogo from "@/components/KoraaLogo";

/**
 * Passwords are held by Firebase — registration and login both go through
 * `registerWithEmail` / `signInWithEmail`, which wrap Firebase's own calls — so
 * the reset has to be Firebase's. Django's password-reset endpoints would change
 * a password that login never checks, leaving the user still locked out.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/invalid-email") {
        setError("That does not look like a valid email address.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please wait a few minutes and try again.");
      } else {
        // Anything else — including user-not-found — is reported the same way
        // so this page cannot be used to discover which emails have accounts.
        setSent(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <KoraaLogo className="auth-logo" />
        </div>

        {sent ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 48,
                height: 48,
                background: "rgba(34,197,94,0.1)",
                color: "#16a34a",
                marginBottom: 20,
              }}
            >
              <LuMailCheck size={24} />
            </div>
            <h1
              className="font-display"
              style={{ fontSize: 24, fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}
            >
              Check your email
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 28 }}>
              If an account exists for <strong>{email}</strong>, we have sent a link
              to reset the password. It expires in one hour. Remember to look in
              your spam folder.
            </p>
            <Link href="/auth/login" className="btn btn-primary btn-full" style={{ padding: 14 }}>
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1
              className="font-display"
              style={{ fontSize: 24, fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}
            >
              Reset your password
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 28 }}>
              Enter the email you signed up with and we will send you a link to
              choose a new password.
            </p>

            {error && (
              <div
                style={{
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.2)",
                  padding: "12px 16px",
                  marginBottom: 20,
                  fontSize: 13,
                  color: "#ef4444",
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div className="input-group">
                <label className="input-label" htmlFor="reset-email">
                  Email address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  className="input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={busy}
                style={{ marginTop: 4, padding: 14 }}
              >
                {busy ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="spin-fast">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 60" />
                    </svg>
                    Sending…
                  </span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    Send reset link <LuArrowRight size={16} />
                  </span>
                )}
              </button>
            </form>

            <p style={{ textAlign: "center", fontSize: 14, color: "var(--text-muted)", marginTop: 28 }}>
              <Link
                href="/auth/login"
                style={{
                  color: "var(--brand-600)",
                  fontWeight: 600,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <LuArrowLeft size={14} /> Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
