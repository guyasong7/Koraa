"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LuArrowRight, LuEye, LuEyeOff } from "react-icons/lu";
import KoraaLogo from "@/components/KoraaLogo";
import { authApi } from "@/lib/api";

/**
 * Completes the Django-side password reset (POST /auth/password-reset/confirm/).
 *
 * Accounts that sign in through Firebase do not land here — the request
 * endpoint mails those users to /auth/forgot-password instead, because a
 * Django password is not what Firebase login checks.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}

// useSearchParams() opts a component out of prerendering, and Next.js requires
// the bail-out to be contained by a Suspense boundary — without one, `next build`
// fails on this route instead of rendering it dynamically.
function ResetPasswordContent() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [form, setForm] = useState({ password: "", password_confirm: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.password_confirm) {
      setError("The two passwords do not match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      await authApi.confirmPasswordReset(token, form.password, form.password_confirm);
      setDone(true);
      setTimeout(() => router.push("/auth/login"), 1800);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const first = data
        ? Object.values(data).flat().find((v) => typeof v === "string")
        : undefined;
      setError(
        (first as string) ??
          "That reset link is invalid or has expired. Request a new one."
      );
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = { paddingRight: 44 };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <KoraaLogo className="auth-logo" />
        </div>

        {!token ? (
          <>
            <h1
              className="font-display"
              style={{ fontSize: 24, fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}
            >
              Link incomplete
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 28 }}>
              This page needs the token from your reset email. Request a fresh
              link and open it directly from the message.
            </p>
            <Link href="/auth/forgot-password" className="btn btn-primary btn-full" style={{ padding: 14 }}>
              Request a new link
            </Link>
          </>
        ) : done ? (
          <>
            <h1
              className="font-display"
              style={{ fontSize: 24, fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}
            >
              Password changed
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 28 }}>
              Taking you to the sign-in page…
            </p>
            <Link href="/auth/login" className="btn btn-primary btn-full" style={{ padding: 14 }}>
              Sign in now
            </Link>
          </>
        ) : (
          <>
            <h1
              className="font-display"
              style={{ fontSize: 24, fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}
            >
              Choose a new password
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 28 }}>
              Pick something you have not used on Koraa before.
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
                <label className="input-label" htmlFor="new-password">
                  New password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="new-password"
                    type={show ? "text" : "password"}
                    className="input"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    autoFocus
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label={show ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute",
                      right: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {show ? <LuEyeOff size={17} /> : <LuEye size={17} />}
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="confirm-password">
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type={show ? "text" : "password"}
                  className="input"
                  placeholder="••••••••"
                  value={form.password_confirm}
                  onChange={(e) => setForm({ ...form, password_confirm: e.target.value })}
                  required
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
                    Saving…
                  </span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    Change password <LuArrowRight size={16} />
                  </span>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
