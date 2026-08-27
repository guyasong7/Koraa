"use client";

import Link from "next/link";
import KoraaLogo from "@/components/KoraaLogo";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import toast from "react-hot-toast";
import { LuEye, LuEyeOff, LuArrowRight } from "react-icons/lu";
import { FcGoogle } from "react-icons/fc";
import {
  signInWithGoogle,
  signInWithEmail,
  startGoogleRedirect,
  consumeRedirectResult,
  tookGoogleRedirect,
} from "@/lib/firebase";
import { socialAuthErrorMessage } from "@/lib/socialAuthError";

export default function LoginPage() {
  const router = useRouter();
  const { socialLogin, isLoading } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    try {
      useAuthStore.setState({ isLoading: true });
      const idToken = await signInWithEmail(form.email, form.password);
      await socialLogin("firebase", idToken);

      const user = useAuthStore.getState().user;
      if (user && !user.has_merchant) {
        toast.success("Welcome! Let's set up your store.");
        router.push("/auth/onboarding");
      } else {
        toast.success("Welcome back!");
        router.push("/dashboard");
      }
    } catch (err: any) {
      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password"
      ) {
        setErrors({ general: "Invalid email or password." });
      } else if (err.code === "auth/user-disabled") {
        setErrors({ general: "This account has been disabled. Please contact support." });
      } else {
        // Backend social auth returns {error: "..."}, not {detail: "..."}.
        const msg =
          err?.response?.data?.error ||
          err?.response?.data?.detail ||
          err.message;
        if (msg && typeof msg === "string" && !msg.startsWith("Request failed")) {
          toast.error(msg);
        } else {
          setErrors({ general: "Failed to sign in. Please try again." });
        }
      }
    } finally {
      useAuthStore.setState({ isLoading: false });
    }
  };

  // Completes a sign-in that left the page for Google. `consumeRedirectResult`
  // is single-flight, which is what makes this safe under React Strict Mode —
  // it double-invokes effects in development, and two concurrent
  // `getRedirectResult` calls race over one shared Firebase event stream and
  // trip an internal assertion. See the note in lib/firebase.ts.
  useEffect(() => {
    // Read before the first await, so the double-invoked effect cannot both
    // claim the return leg and report the same failure twice.
    const returning = tookGoogleRedirect();

    const handleRedirectResult = async () => {
      try {
        const result = await consumeRedirectResult();
        if (!result) return;

        useAuthStore.setState({ isLoading: true });
        try {
          const idToken = await result.user.getIdToken();
          await useAuthStore.getState().socialLogin("google", idToken);
          const user = useAuthStore.getState().user;
          if (user && !user.has_merchant) {
            toast.success("Account connected! Let's set up your store.");
            router.push("/auth/onboarding");
          } else {
            toast.success("Welcome back!");
            router.push("/dashboard");
          }
        } finally {
          useAuthStore.setState({ isLoading: false });
        }
      } catch (err) {
        // Only worth reporting if a redirect actually happened. On an ordinary
        // visit there is no sign-in in progress to have failed, and a toast
        // here would be about nothing.
        const message = socialAuthErrorMessage(err);
        if (returning && message) toast.error(message);
      }
    };
    void handleRedirectResult();
  }, [router]);

  const handleGoogleLogin = async () => {
    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        useAuthStore.setState({ isLoading: true });
        await startGoogleRedirect();
        return;
      }

      const idToken = await signInWithGoogle();
      await useAuthStore.getState().socialLogin("google", idToken);
      const user = useAuthStore.getState().user;
      if (user && !user.has_merchant) {
        toast.success("Account connected! Let's set up your store.");
        router.push("/auth/onboarding");
      } else {
        toast.success("Welcome back!");
        router.push("/dashboard");
      }
    } catch (err: any) {
      // A blocked popup is not a failed sign-in, and telling the user it was
      // leaves them stuck on a button that will never work. Finish the same
      // sign-in without a popup instead: the redirect flow leaves the page, and
      // the effect above picks the result up on the way back.
      if (err.code === "auth/popup-blocked") {
        try {
          useAuthStore.setState({ isLoading: true });
          await startGoogleRedirect();
          return;
        } catch {
          useAuthStore.setState({ isLoading: false });
        }
      }

      // Everything else — a closed popup, an unauthorized domain, a build with
      // no Firebase credentials, an unreachable API, a token the backend would
      // not take. The helper logs the real error and answers null for the cases
      // that are not worth a toast.
      const message = socialAuthErrorMessage(err);
      if (message) toast.error(message);
    }
  };


  return (
    <div className="auth-container">

      <div className="auth-card">
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <KoraaLogo className="auth-logo" />
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>The Cameroonian ecommerce platform</p>
        </div>

        <h1 className="font-display" style={{ fontSize: 24, fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}>
          Welcome back
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 28 }}>
          Sign in to manage your store
        </p>

        {errors.general && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#ef4444" }}>
            {errors.general}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          <button type="button" className="btn btn-secondary" style={{ width: "100%" }}
            onClick={() => handleGoogleLogin()} disabled={isLoading}>
            <FcGoogle size={18} /> Continue with Google
          </button>
        </div>

        <div className="divider" style={{ marginBottom: 24, fontSize: 12, textTransform: "uppercase", fontWeight: 600 }}>
          Or sign in with email
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="input-group">
            <label className="input-label">Email address</label>
            <input type="email" className="input" placeholder="you@example.com" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus />
          </div>

          <div className="input-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label className="input-label" style={{ margin: 0 }}>Password</label>
              <Link href="/auth/forgot-password" style={{ fontSize: 13, color: "var(--brand-600)", textDecoration: "none" }}>
                Forgot password?
              </Link>
            </div>
            <div style={{ position: "relative" }}>
              <input type={showPassword ? "text" : "password"} className="input" placeholder="••••••••"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                required style={{ paddingRight: 44 }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
                {showPassword ? <LuEyeOff size={17} /> : <LuEye size={17} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={isLoading} style={{ marginTop: 4, padding: "14px" }}>
            {isLoading ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="spin-fast"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 60" /></svg>
                Signing in…
              </span>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>Sign in <LuArrowRight size={16} /></span>
            )}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 14, color: "var(--text-muted)", marginTop: 28 }}>
          Don&apos;t have an account?{" "}
          <Link href="/auth/register" style={{ color: "var(--brand-600)", fontWeight: 600, textDecoration: "none" }}>
            Create one free →
          </Link>
        </p>
      </div>
    </div>
  );
}
