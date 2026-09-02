"use client";

import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { LuCircleCheck, LuCircleX, LuLoader, LuArrowRight, LuEye, LuEyeOff } from "react-icons/lu";
import KoraaLogo from "@/components/KoraaLogo";

/**
 * Firebase custom action URL handler.
 *
 * Firebase sends transactional emails (email verification, password reset,
 * email recovery) with links that point to a host-supplied action URL, set in
 * Firebase Console -> Authentication -> Templates -> Action URL.
 *
 * We set that to https://koraa.cm/_/auth/action so users land on our own
 * branded page instead of the generic Firebase one. Firebase appends:
 *
 *   ?mode=verifyEmail|resetPassword|recoverEmail
 *   &oobCode=<one-time token>
 *   &continueUrl=<where to go after>   (optional, we set it)
 *   &lang=<locale>                     (optional)
 *
 * This page reads `mode` and `oobCode`, calls the correct Firebase SDK method,
 * and presents an appropriate confirmation or error UI.
 */
export default function FirebaseActionPage() {
  return (
    <Suspense fallback={<ActionSkeleton />}>
      <ActionContent />
    </Suspense>
  );
}

function ActionSkeleton() {
  return (
    <div className="auth-container">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <KoraaLogo className="auth-logo" style={{ marginBottom: 32 }} />
        <LuLoader size={28} className="spin-fast" style={{ color: "var(--brand-600)", margin: "0 auto" }} />
      </div>
    </div>
  );
}

type Phase =
  | { status: "loading" }
  | { status: "verifying" }
  | { status: "verified" }
  | { status: "reset-form" }
  | { status: "reset-done" }
  | { status: "recovering" }
  | { status: "recovered"; email: string }
  | { status: "error"; message: string }
  | { status: "unknown-mode"; mode: string };

function ActionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const mode = searchParams.get("mode") ?? "";
  const oobCode = searchParams.get("oobCode") ?? "";
  const continueUrl = searchParams.get("continueUrl") ?? "/auth/login";

  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!oobCode) {
      setPhase({ status: "error", message: "This link is incomplete or has already been used." });
      return;
    }

    switch (mode) {
      case "verifyEmail":
        handleVerifyEmail(oobCode);
        break;
      case "resetPassword":
        // Don't auto-apply — show the password form first
        setPhase({ status: "reset-form" });
        break;
      case "recoverEmail":
        handleRecoverEmail(oobCode);
        break;
      default:
        setPhase({ status: "unknown-mode", mode });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleVerifyEmail(code: string) {
    setPhase({ status: "verifying" });
    try {
      const { loadFirebaseAction } = await import("@/lib/firebaseAction");
      await loadFirebaseAction.applyActionCode(code);
      setPhase({ status: "verified" });
    } catch (err) {
      const message = codeToMessage(err);
      setPhase({ status: "error", message });
    }
  }

  async function handleRecoverEmail(code: string) {
    setPhase({ status: "recovering" });
    try {
      const { loadFirebaseAction } = await import("@/lib/firebaseAction");
      const info = await loadFirebaseAction.checkActionCode(code);
      const restoredEmail = info.data.email ?? "";
      await loadFirebaseAction.applyActionCode(code);
      setPhase({ status: "recovered", email: restoredEmail });
    } catch (err) {
      const message = codeToMessage(err);
      setPhase({ status: "error", message });
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (password !== confirm) {
      setFormError("The two passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setFormError("Use at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      const { loadFirebaseAction } = await import("@/lib/firebaseAction");
      await loadFirebaseAction.confirmPasswordReset(oobCode, password);
      setPhase({ status: "reset-done" });
      setTimeout(() => router.push("/auth/login"), 2000);
    } catch (err) {
      setFormError(codeToMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <KoraaLogo className="auth-logo" />
        </div>

        {/* Loading / in-progress states */}
        {(phase.status === "loading" || phase.status === "verifying" || phase.status === "recovering") && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <LuLoader
              size={32}
              className="spin-fast"
              style={{ color: "var(--brand-600)", display: "block", margin: "0 auto 20px" }}
            />
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
              {phase.status === "verifying" && "Verifying your email address…"}
              {phase.status === "recovering" && "Restoring your email address…"}
              {phase.status === "loading" && "Loading…"}
            </p>
          </div>
        )}

        {/* Email verified */}
        {phase.status === "verified" && (
          <>
            <SuccessIcon />
            <h1 className="font-display action-heading">Email verified</h1>
            <p className="action-sub">
              Your address has been confirmed. You can now sign in to your Koraa
              account.
            </p>
            <Link href="/auth/login" className="btn btn-primary btn-full" style={{ padding: 14 }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                Continue to sign in <LuArrowRight size={16} />
              </span>
            </Link>
          </>
        )}

        {/* Reset password form */}
        {phase.status === "reset-form" && (
          <>
            <h1 className="font-display action-heading">Choose a new password</h1>
            <p className="action-sub">Pick something you have not used on Koraa before.</p>

            {formError && (
              <div className="auth-error-box">{formError}</div>
            )}

            <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div className="input-group">
                <label className="input-label" htmlFor="action-new-password">New password</label>
                <div style={{ position: "relative" }}>
                  <input
                    id="action-new-password"
                    type={show ? "text" : "password"}
                    className="input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label={show ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--text-muted)", display: "flex", alignItems: "center",
                    }}
                  >
                    {show ? <LuEyeOff size={17} /> : <LuEye size={17} />}
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="action-confirm-password">Confirm new password</label>
                <input
                  id="action-confirm-password"
                  type={show ? "text" : "password"}
                  className="input"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="spin-fast">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 60" />
                    </svg>
                    Saving…
                  </span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    Change password <LuArrowRight size={16} />
                  </span>
                )}
              </button>
            </form>
          </>
        )}

        {/* Password reset done */}
        {phase.status === "reset-done" && (
          <>
            <SuccessIcon />
            <h1 className="font-display action-heading">Password changed</h1>
            <p className="action-sub">Taking you to the sign-in page…</p>
            <Link href="/auth/login" className="btn btn-primary btn-full" style={{ padding: 14 }}>
              Sign in now
            </Link>
          </>
        )}

        {/* Email recovered */}
        {phase.status === "recovered" && (
          <>
            <SuccessIcon />
            <h1 className="font-display action-heading">Email address restored</h1>
            <p className="action-sub">
              Your sign-in address has been reset back to{" "}
              <strong>{(phase as { email: string }).email}</strong>.
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 24 }}>
              We recommend changing your password now in case someone else made the change.
            </p>
            <Link href="/auth/login" className="btn btn-primary btn-full" style={{ padding: 14 }}>
              Back to sign in
            </Link>
          </>
        )}

        {/* Error */}
        {phase.status === "error" && (
          <>
            <ErrorIcon />
            <h1 className="font-display action-heading">Something went wrong</h1>
            <p className="action-sub">{phase.message}</p>
            <Link href="/auth/login" className="btn btn-primary btn-full" style={{ padding: 14 }}>
              Back to sign in
            </Link>
          </>
        )}

        {/* Unknown mode */}
        {phase.status === "unknown-mode" && (
          <>
            <ErrorIcon />
            <h1 className="font-display action-heading">Unknown action</h1>
            <p className="action-sub">
              This link type is not recognised. If you need help, contact support.
            </p>
            <Link href="/" className="btn btn-primary btn-full" style={{ padding: 14 }}>
              Go to Koraa
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function SuccessIcon() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 56, height: 56, borderRadius: "50%",
      background: "rgba(34,197,94,0.1)", color: "#16a34a",
      marginBottom: 20,
    }}>
      <LuCircleCheck size={28} />
    </div>
  );
}

function ErrorIcon() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 56, height: 56, borderRadius: "50%",
      background: "rgba(248,113,113,0.1)", color: "#ef4444",
      marginBottom: 20,
    }}>
      <LuCircleX size={28} />
    </div>
  );
}

// ── Error translation ──────────────────────────────────────────────────────────

function codeToMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/expired-action-code":
      return "This link has expired. Request a fresh one and try again.";
    case "auth/invalid-action-code":
      return "This link is invalid or has already been used. Request a new one.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact support for help.";
    case "auth/user-not-found":
      return "No account was found for this link. It may have been deleted.";
    case "auth/weak-password":
      return "Choose a stronger password — at least 8 characters.";
    default:
      return "Something unexpected happened. Please try again or contact support.";
  }
}
