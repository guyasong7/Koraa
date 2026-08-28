"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import KoraaLogo from "@/components/KoraaLogo";
import { MtnLogo } from "@/components/RailLogos";
import toast from "react-hot-toast";
import { LuEye, LuEyeOff, LuArrowRight, LuTrendingUp } from "react-icons/lu";
import { FcGoogle } from "react-icons/fc";
import { registerWithEmail } from "@/lib/firebase";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterContent />
    </Suspense>
  );
}

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refCode = searchParams.get("ref") || "";
  const { socialLogin, isLoading } = useAuthStore();
  // Completes a returning Google redirect on mount and hands back the button's
  // handler. See hooks/useGoogleAuth.ts for why this is not two copies.
  const { signIn: handleGoogleLogin } = useGoogleAuth({ referralCode: refCode });
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    phone: "",
    password: "",
    password_confirm: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (form.password !== form.password_confirm) {
      setErrors({ password_confirm: "Passwords do not match." });
      return;
    }

    try {
      useAuthStore.setState({ isLoading: true });
      const idToken = await registerWithEmail(form.email, form.password, form.full_name);
      await socialLogin("firebase", idToken, form.full_name, refCode || undefined);

      const user = useAuthStore.getState().user;
      if (user && !user.has_merchant) {
        toast.success("Account created! Let's set up your store.");
        router.push("/auth/onboarding");
      } else {
        toast.success("Welcome! Redirecting to dashboard.");
        router.push("/dashboard");
      }
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") {
        setErrors({ email: "Email is already registered." });
      } else if (err.code === "auth/weak-password") {
        setErrors({ password: "Password should be at least 6 characters." });
      } else {
        const data = err?.response?.data;
        if (data && typeof data === "object") {
          const fieldErrors: Record<string, string> = {};
          Object.entries(data).forEach(([key, val]) => {
            fieldErrors[key] = Array.isArray(val) ? val[0] : String(val);
          });
          setErrors(fieldErrors);
        } else {
          toast.error(err.message || "Something went wrong. Please try again.");
        }
      }
    } finally {
      useAuthStore.setState({ isLoading: false });
    }
  };

  return (
    <div className="auth-split-shell">
      {/* `--wide` widens the form's content area past the shared default.
          Sign-up carries five fields, two of them paired, and the extra
          room is what keeps those pairs from reading as cramped. */}
      <div className="auth-split auth-split--wide">
        <div className="auth-split__form">
          <div className="auth-split__brand">
            <KoraaLogo className="auth-logo" />
          </div>

          <div className="auth-split__head">
            <h1 className="auth-split__title">Create your account</h1>
            <p className="auth-split__sub">
              A storefront, a checkout your customers pay from their phone, and
              one dashboard for both.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="auth-split__field">
              <label className="auth-split__label" htmlFor="full_name">Full name</label>
              <input
                id="full_name"
                type="text"
                className={`input ${errors.full_name ? "input-error" : ""}`}
                placeholder="Your full name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
                autoFocus
              />
              {errors.full_name && <span className="error-text">{errors.full_name}</span>}
            </div>

            {/* Paired to keep the column short. Five stacked fields ran the
                form past the photo beside it, and the taller of the two is
                what set the card's height. */}
            <div className="auth-split__row">
              <div className="auth-split__field">
                <label className="auth-split__label" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  className={`input ${errors.email ? "input-error" : ""}`}
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
                {errors.email && <span className="error-text">{errors.email}</span>}
              </div>

              <div className="auth-split__field">
                <label className="auth-split__label" htmlFor="phone">Phone (optional)</label>
                <input
                  id="phone"
                  type="tel"
                  className="input"
                  placeholder="+237 600 000 000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="auth-split__row">
              <div className="auth-split__field">
                <label className="auth-split__label" htmlFor="password">Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className={`input ${errors.password ? "input-error" : ""}`}
                    placeholder="8+ characters"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    /* Clears the toggle. The pill's own padding is 18px, so
                       anything less than this puts text under the icon. */
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center" }}
                  >
                    {showPassword ? <LuEyeOff size={17} /> : <LuEye size={17} />}
                  </button>
                </div>
                {errors.password && <span className="error-text">{errors.password}</span>}
              </div>

              <div className="auth-split__field">
                <label className="auth-split__label" htmlFor="password_confirm">Confirm</label>
                <input
                  id="password_confirm"
                  type="password"
                  className={`input ${errors.password_confirm ? "input-error" : ""}`}
                  placeholder="Repeat password"
                  value={form.password_confirm}
                  onChange={(e) => setForm({ ...form, password_confirm: e.target.value })}
                  required
                />
                {errors.password_confirm && <span className="error-text">{errors.password_confirm}</span>}
              </div>
            </div>

            <button
              type="submit"
              className="auth-split__btn auth-split__btn--primary"
              disabled={isLoading}
              style={{ marginTop: 10 }}
            >
              {isLoading ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="spin-fast"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 60" /></svg>
                  Creating account…
                </>
              ) : (
                <>
                  Create free account <LuArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="divider" style={{ margin: "18px 0", fontSize: 12, textTransform: "uppercase", fontWeight: 600 }}>
            or
          </div>

          <div className="auth-split__socials">
            <button
              type="button"
              className="auth-split__btn auth-split__btn--ghost"
              onClick={() => handleGoogleLogin()}
              disabled={isLoading}
            >
              <FcGoogle size={18} /> Continue with Google
            </button>
          </div>

          <p className="auth-split__foot">
            Already have an account? <Link href="/auth/login">Sign in</Link>
            <br />
            By continuing you agree to our <Link href="#">Terms</Link> and{" "}
            <Link href="#">Privacy Policy</Link>.
          </p>
        </div>

        {/* Photo column. The image is a CSS custom property rather than an
            <img> or next/image because it is a cropped background — the
            element is sized by the grid track and the photo fills it, which
            is `background-size: cover`'s job, not a layout image's. */}
        <div className="auth-split__aside" aria-hidden="true">
          <div
            className="auth-split__photo"
            style={{ "--auth-photo": "url('/images/apron-phone.jpg')" } as React.CSSProperties}
          >
            {/* What the merchant is actually signing up for, laid over the
                person doing it: money arriving, and orders counted. */}
            <div className="auth-split__float auth-split__float--pay">
              <MtnLogo className="auth-split__float-rail" decorative />
              <div>
                <p className="auth-split__float-label">Payment received</p>
                <p className="auth-split__float-value">XAF 12,500</p>
              </div>
            </div>

            <div className="auth-split__float auth-split__float--stat">
              <div
                style={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--brand-tint)",
                  border: "1px solid var(--brand-tint-border)",
                  color: "var(--brand-text)",
                }}
              >
                <LuTrendingUp size={16} />
              </div>
              <div>
                <p className="auth-split__float-label">Orders today</p>
                <p className="auth-split__float-value">24</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
