"use client";
import PageTitle from "@/components/PageTitle";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import React, { Suspense } from "react";
import { useAuthStore } from "@/stores/auth";
import { authApi, merchantApi, storeApi, teamApi } from "@/lib/api";
import { ROOT_DOMAIN, storefrontHost } from "@/lib/rootDomain";

import toast from "react-hot-toast";
import {
  LuUser,
  LuCreditCard,
  LuShield,
  LuUsers,
  LuTruck,
  LuPalette,
  LuCircleDollarSign,
  LuBell,
  LuRotateCcw,
  LuGlobe,
  LuBadgeCheck,
  LuLoader,
  LuCrown,
  LuCalendar,
  LuCheck,
  LuPhone,
  LuGift,
  LuCopy,
  LuArrowUpRight,
  LuStar,
  LuZap,
} from "react-icons/lu";
import {
  sendPhoneOTP,
  verifyPhoneOTP,
  sendVerificationEmail,
  refreshEmailVerification,
} from "@/lib/firebase";
import {
  IdFrontGlyph,
  IdBackGlyph,
  SelfieIdGlyph,
  UploadGlyph,
  UploadedGlyph,
} from "@/components/UploadGlyphs";
import type { ConfirmationResult } from "firebase/auth";
import { paymentApi } from "@/lib/api";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const SETTINGS_TABS = [
  { id: "profile",      label: "My Profile",    icon: LuUser },
  { id: "plan",         label: "Subscription",  icon: LuCrown },
  { id: "identity",    label: "Identity",       icon: LuBadgeCheck },
  { id: "domain",      label: "Domain",         icon: LuGlobe },
  { id: "payout",      label: "Payout Account", icon: LuCreditCard },
  { id: "security",    label: "Security",       icon: LuShield },
  { id: "team",        label: "Team",           icon: LuUsers },
  { id: "delivery",    label: "Delivery",       icon: LuTruck },
  { id: "customisation",label: "Customisation", icon: LuPalette },
  { id: "currency",    label: "Currency",       icon: LuCircleDollarSign },
  { id: "notification",label: "Notifications",  icon: LuBell },
  { id: "refunds",     label: "Returns/Refunds",icon: LuRotateCcw },
  { id: "referrals",   label: "Referrals",      icon: LuGift },
];

const PLAN_COLORS: Record<string, string> = {
  free:       "#6b7280",
  starter:    "#3b82f6",
  pro:        "var(--brand-600)",
  enterprise: "#1a1a1a",
};

const PLAN_FEATURES: Record<string, string[]> = {
  free:       ["1 Store", "50 Products", "Koraa Subdomain", "Basic Analytics"],
  starter:    ["3 Stores", "200 Products", "All Templates", "Remove Branding", "Priority Payments"],
  pro:        ["Unlimited Stores", "Unlimited Products", "Free .cm Domain", "Staff Accounts ×5", "API Access"],
  enterprise: ["Everything in Pro", "Professional Email", "Unlimited Staff", "Dedicated Manager", "99.9% SLA"],
};

function PlanTab() {
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    paymentApi.getSubscription()
      .then(r => setSub(r.data))
      .catch(() => setSub({ plan: "free", status: "active" }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <LuLoader size={28} className="spin" color="var(--brand-600)" style={{ margin: "0 auto" }} />
    </div>
  );

  const plan    = sub?.plan || "free";
  const status  = sub?.status || "active";
  const cycle   = sub?.billing_cycle || "";
  const expires = sub?.expires_at
    ? new Date(sub.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const planColor = PLAN_COLORS[plan] || "#6b7280";
  const isDark = plan === "enterprise";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Plan Hero Card */}
      <div style={{
        background: isDark ? "#1a1a1a" : `${planColor}10`,
        border: `1.5px solid ${isDark ? "rgba(255,255,255,0.1)" : `${planColor}30`}`,
        borderRadius: 16, padding: "28px 28px 24px", position: "relative", overflow: "hidden"
      }}>
        <div style={{ position: "absolute", top: -50, right: -50, width: 160, height: 160, borderRadius: "50%", background: `${planColor}15`, pointerEvents: "none" }} />

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <LuCrown size={24} color={isDark ? "#fff" : planColor} />
              <span style={{ fontSize: 24, fontWeight: 800, fontFamily: "Outfit,sans-serif", color: isDark ? "#fff" : "#1a1a1a", textTransform: "capitalize" }}>
                {plan} Plan
              </span>
              <span style={{
                padding: "4px 10px", borderRadius: 100, fontSize: 11, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.06em",
                background: status === "active" ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)",
                color: status === "active" ? "#16a34a" : "#d97706"
              }}>
                {status}
              </span>
            </div>
            <p style={{ fontSize: 15, color: isDark ? "rgba(255,255,255,0.6)" : "var(--text-secondary)", margin: 0 }}>
              {plan === "free"
                ? "You are on the free tier. Upgrade to unlock more features."
                : `Billed ${cycle}.`}
            </p>
          </div>

          {plan !== "enterprise" && (
            <Link href="/dashboard/billing" style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "11px 22px",
              background: isDark ? "#fff" : planColor, color: isDark ? "#1a1a1a" : "#fff",
              fontWeight: 700, textDecoration: "none", fontSize: 14, borderRadius: 10
            }}>
              Upgrade Plan <LuArrowUpRight size={14} />
            </Link>
          )}
        </div>

        {/* Expiry bar */}
        {expires && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 20, paddingTop: 20,
            borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : `${planColor}25`}`
          }}>
            <LuCalendar size={16} color={isDark ? "rgba(255,255,255,0.5)" : planColor} />
            <span style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.6)" : "var(--text-secondary)" }}>
              Plan renews / expires on{" "}
              <strong style={{ color: isDark ? "#fff" : "var(--text-primary)" }}>{expires}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Included features */}
      <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
        <h3 style={{ margin: "0 0 18px", fontSize: 17, fontWeight: 700 }}>What&apos;s included</h3>
        <div className="mobile-stack-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {(PLAN_FEATURES[plan] || []).map(f => (
            <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--text-secondary)" }}>
              <LuCheck size={15} color="#22c55e" style={{ flexShrink: 0 }} />
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Upgrade nudge for free / starter */}
      {(plan === "free" || plan === "starter") && (
        <div style={{ background: "var(--surface)", border: "1px solid #e5e7eb", borderRadius: 12, padding: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15 }}>Unlock the full Koraa experience</p>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>Get a custom .cm domain, unlimited products & priority support on the Pro plan.</p>
          </div>
          <Link href="/dashboard/billing" style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px",
            background: "var(--brand-600)", color: "#fff", fontWeight: 700,
            textDecoration: "none", fontSize: 14, borderRadius: 10, whiteSpace: "nowrap"
          }}>
            View Plans <LuArrowUpRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}

function ProfileTab() {
  const { user, fetchMe } = useAuthStore();
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || "");

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await authApi.updateMe({ full_name: fullName });
      toast.success("Profile updated");
      fetchMe();
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarPreview(URL.createObjectURL(file));
      const formData = new FormData();
      formData.append("avatar", file);
      try {
        await authApi.updateMe(formData);
        toast.success("Profile picture updated");
        fetchMe();
      } catch {
        toast.error("Failed to update profile picture");
      }
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== newPasswordConfirm) {
      return toast.error("Passwords do not match");
    }
    try {
      setLoading(true);
      await authApi.changePassword({ 
        current_password: password, 
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm
      });
      toast.success("Password changed successfully");
      setPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
    } catch {
      toast.error("Failed to change password. Check current password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <form onSubmit={handleUpdateProfile} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Basic Information</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--border)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 24, fontWeight: 700, color: "var(--text-muted)" }}>{fullName[0]}</span>
            )}
          </div>
          <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
            Change Avatar
            <input type="file" accept="image/*" hidden onChange={handleAvatarChange} />
          </label>
        </div>
        <div className="form-control">
          <label className="label">Full Name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div>
          <button type="submit" className="btn btn-primary" disabled={loading}>Save Profile</button>
        </div>
      </form>
      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />
      <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Change Password</h3>
        <div className="form-control">
          <label className="label">Current Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="form-control">
          <label className="label">New Password</label>
          <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
        </div>
        <div className="form-control">
          <label className="label">Confirm New Password</label>
          <input className="input" type="password" value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} required />
        </div>
        <div>
          <button type="submit" className="btn btn-secondary" disabled={loading}>Update Password</button>
        </div>
      </form>
    </div>
  );
}

function IdentityTab() {
  const { user, fetchMe } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  // ── Personal info state ───────────────────────────────────────
  const [infoSaving, setInfoSaving] = useState(false);
  const [personalInfo, setPersonalInfo] = useState({
    full_name: user?.full_name || "",
    date_of_birth: user?.date_of_birth || "",
    gender: user?.gender || "",
    id_card_number: user?.id_card_number || "",
    city: user?.city || "",
  });

  useEffect(() => {
    if (user) {
      setPersonalInfo({
        full_name: user.full_name || "",
        date_of_birth: user.date_of_birth || "",
        gender: user.gender || "",
        id_card_number: user.id_card_number || "",
        city: user.city || "",
      });
    }
  }, [user?.id]);

  const CAMEROON_CITIES = [
    "Akonolinga", "Ambam", "Ayos", "Bafia", "Bafang", "Bafoussam", "Bangangté",
    "Banyo", "Batouri", "Belabo", "Bélel", "Bertoua", "Bipindi", "Buea",
    "Campo", "Djoum", "Douala", "Dschang", "Edéa", "Ébolowa", "Foumban",
    "Fundong", "Garoua", "Guider", "Kaélé", "Kontcha", "Kousseri", "Kribi",
    "Kumba", "Kumbo", "Lagdo", "Limbe", "Loum", "Maroua", "Mbalmayo",
    "Mbengwi", "Meiganga", "Meyomessala", "Mfou", "Mbouda", "Monatélé",
    "Mora", "Mvangué", "Nanga Eboko", "Ndop", "Ngaoundal", "Ngaoundéré",
    "Nkambe", "Nkongsamba", "Ntui", "Nyambaka", "Obala", "Poli", "Rey Bouba",
    "Sangmélima", "Tcholliré", "Tignère", "Tibati", "Tokombéré", "Touboro",
    "Waza", "Wum", "Yagoua", "Yaoundé", "Yokadouma", "Zoétélé",
  ];

  const handleSavePersonalInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setInfoSaving(true);
      await authApi.updateMe(personalInfo as any);
      await fetchMe();
      toast.success("Personal information saved!");
    } catch {
      toast.error("Failed to save personal information.");
    } finally {
      setInfoSaving(false);
    }
  };

  // ── Phone verification state ──────────────────────────────────
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneStep, setPhoneStep] = useState<"idle" | "sending" | "code" | "done">("idle");
  const [phoneCode, setPhoneCode] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [phoneError, setPhoneError] = useState("");

  const [identityData, setIdentityData] = useState<any>(null);
  const [loadingIdentity, setLoadingIdentity] = useState(true);

  useEffect(() => {
    merchantApi.getIdentity()
      .then(res => setIdentityData(res.data))
      .catch(() => {})
      .finally(() => setLoadingIdentity(false));
  }, []);

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append(field, file);
    try {
      setLoading(true);
      const res = await merchantApi.uploadIdentity(formData);
      setIdentityData(res.data);
      const status = res.data?.verification_status;
      if (status === "Approved") {
        toast.success("Identity verified successfully! ✓");
      } else if (status === "Declined") {
        toast.error("Identity verification declined. Please upload a clearer image.");
      } else if (status === "Error") {
        toast.error("Verification service unavailable. Please try again later.");
      } else {
        toast.success("Document uploaded. Verification in progress…");
      }
    } catch (error: any) {
      console.error("Upload Error:", error.response?.data || error);
      toast.error(error.response?.data?.detail || "Failed to upload document.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendVerificationLink = async () => {
    try {
      setLoading(true);
      // `false` means Firebase no longer holds a session in this browser, which
      // it can only answer once the SDK has finished restoring one. A Koraa
      // session outliving its Firebase session is the case this catches.
      if (!(await sendVerificationEmail())) {
        toast.error("Please log out and log in again to send the verification link.");
        return;
      }
      setOtpSent(true);
      toast.success("Verification link sent! Please check your email.");
      setTimeout(() => setOtpSent(false), 60000); // allow resend after 60s
    } catch (err: any) {
      if (err.code === "auth/too-many-requests") {
        toast.error("Too many requests. Please wait a minute before trying again.");
      } else {
        toast.error(err.message || "Failed to send verification email.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshStatus = async () => {
    setLoading(true);
    try {
      // Non-null only once Firebase agrees the address is verified, so the
      // backend is only asked to re-read the claim when it has actually changed.
      const idToken = await refreshEmailVerification();
      if (idToken) {
        await useAuthStore.getState().socialLogin("firebase", idToken);
      }
      await fetchMe();
      const updatedUser = useAuthStore.getState().user;
      if (updatedUser?.is_verified) {
        toast.success("Email successfully verified!");
      } else {
        toast.error("Email not yet verified. Please click the link in your email.");
      }
    } catch (err) {
      toast.error("Failed to check verification status.");
    } finally {
      setLoading(false);
    }
  };

  /** Normalise Cameroon number to E.164 (+237XXXXXXXXX) */
  const normalisePhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, "");
    if (digits.startsWith("237")) return `+${digits}`;
    if (digits.startsWith("0")) return `+237${digits.slice(1)}`;
    return `+237${digits}`;
  };

  const handleSendSMS = async () => {
    setPhoneError("");
    const e164 = normalisePhone(phoneInput);
    if (!/^\+237[62]\d{8}$/.test(e164)) {
      setPhoneError("Enter a valid Cameroon number (e.g. 6XX XXX XXX or 2XX XXX XXX).");
      return;
    }
    setPhoneStep("sending");
    try {
      const result = await sendPhoneOTP(e164, "recaptcha-container");
      setConfirmation(result);
      setPhoneStep("code");
      toast.success(`SMS sent to ${e164}`);
    } catch (err: any) {
      setPhoneStep("idle");
      const msg = err?.code === "auth/invalid-phone-number"
        ? "Invalid phone number. Use international format."
        : err?.message || "Failed to send SMS. Try again.";
      setPhoneError(msg);
    }
  };

  const handleVerifySMS = async () => {
    if (!confirmation || !phoneCode) return;
    setPhoneError("");
    setLoading(true);
    try {
      await verifyPhoneOTP(confirmation, phoneCode);
      // Save the verified number to the user's profile
      const e164 = normalisePhone(phoneInput);
      await authApi.updateMe({ phone: e164 } as any);
      await fetchMe();
      setPhoneStep("done");
      toast.success("Phone number verified! ✓");
    } catch (err: any) {
      const msg = err?.code === "auth/invalid-verification-code"
        ? "Incorrect code. Please check the SMS and try again."
        : err?.message || "Verification failed.";
      setPhoneError(msg);
    } finally {
      setLoading(false);
    }
  };

  const isPhoneVerified = phoneStep === "done" || !!user?.phone;

  const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

      {/* ── Personal Information ─────────────────────────────── */}
      <div>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>Personal Information</h3>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--text-muted)" }}>
          This information is private and used for identity verification only.
        </p>
        <form onSubmit={handleSavePersonalInfo} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="mobile-stack-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Full Name</label>
              <input
                className="input"
                type="text"
                value={personalInfo.full_name}
                onChange={(e) => setPersonalInfo({ ...personalInfo, full_name: e.target.value })}
                placeholder="As it appears on your ID"
                required
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Date of Birth</label>
              <input
                className="input"
                type="date"
                value={personalInfo.date_of_birth}
                onChange={(e) => setPersonalInfo({ ...personalInfo, date_of_birth: e.target.value })}
                max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split("T")[0]}
              />
            </div>
          </div>

          <div className="mobile-stack-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Gender</label>
              <select
                className="input"
                value={personalInfo.gender}
                onChange={(e) => setPersonalInfo({ ...personalInfo, gender: e.target.value })}
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>National ID / Passport No.</label>
              <input
                className="input"
                type="text"
                value={personalInfo.id_card_number}
                onChange={(e) => setPersonalInfo({ ...personalInfo, id_card_number: e.target.value })}
                placeholder="e.g. CM1234567"
              />
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>City (Cameroon)</label>
            <select
              className="input"
              value={personalInfo.city}
              onChange={(e) => setPersonalInfo({ ...personalInfo, city: e.target.value })}
            >
              <option value="">Select your city</option>
              {CAMEROON_CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <button type="submit" className="btn btn-primary" disabled={infoSaving}>
              {infoSaving ? "Saving…" : "Save Personal Info"}
            </button>
          </div>
        </form>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      {/* ── Verifications ────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Verifications</h3>

        {/* Email verification row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, background: "var(--surface-900)", border: "1px solid var(--border)", flexWrap: "wrap", gap: 16 }}>
          <div>
            <p style={{ margin: "0 0 4px", fontWeight: 500 }}>Email Verification</p>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>{user?.email}</p>
          </div>
          {!user?.is_verified ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {otpSent ? "Link sent!" : "Not verified"}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={handleSendVerificationLink} disabled={loading || otpSent}>
                {otpSent ? "Resend in 60s" : "Send Link"}
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleRefreshStatus} disabled={loading}>
                Refresh Status
              </button>
            </div>
          ) : (
            <span className="badge" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>Verified</span>
          )}
        </div>

        {/* Phone verification row */}
        <div style={{ padding: 16, background: "var(--surface-900)", border: "1px solid var(--border)" }}>
          <div id="recaptcha-container" />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <LuPhone size={16} color="var(--brand-600)" />
              <div>
                <p style={{ margin: "0 0 2px", fontWeight: 500 }}>Phone Verification</p>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                  {isPhoneVerified ? (user?.phone || normalisePhone(phoneInput)) : "Verify your Cameroon phone number via SMS"}
                </p>
              </div>
            </div>
            {isPhoneVerified ? (
              <span className="badge" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>Verified</span>
            ) : phoneStep === "code" ? null : (
              <span className="badge" style={{ background: "rgba(234,179,8,0.1)", color: "#ca8a04", fontSize: 12 }}>Not Verified</span>
            )}
          </div>

          {!isPhoneVerified && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {phoneStep !== "code" ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", pointerEvents: "none", display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="18" height="13" viewBox="0 0 900 600" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: 2 }}>
                        <rect width="300" height="600" fill="#007A5E"/>
                        <rect x="300" width="300" height="600" fill="#CE1126"/>
                        <rect x="600" width="300" height="600" fill="#FCD116"/>
                        <polygon fill="#FCD116" points="450,150 472,217 543,217 485,259 507,326 450,284 393,326 415,259 357,217 428,217"/>
                      </svg>
                      +237
                    </span>
                    <input className="input" type="tel" placeholder="6XX XXX XXX" value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)} style={{ paddingLeft: 80 }}
                      disabled={phoneStep === "sending"} />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={handleSendSMS}
                    disabled={phoneStep === "sending" || !phoneInput.trim()} style={{ whiteSpace: "nowrap" }}>
                    {phoneStep === "sending" ? "Sending…" : "Send SMS"}
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                    Enter the 6-digit code sent to <strong>+237{phoneInput.replace(/\D/g, "").replace(/^237/, "")}</strong>
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="input" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                      placeholder="123456" value={phoneCode}
                      onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ""))}
                      style={{ width: 140, letterSpacing: "0.25em", fontWeight: 700, fontSize: 18, textAlign: "center" }} autoFocus />
                    <button className="btn btn-primary btn-sm" onClick={handleVerifySMS} disabled={loading || phoneCode.length < 6}>
                      {loading ? "Verifying…" : "Confirm"}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setPhoneStep("idle"); setPhoneCode(""); setPhoneError(""); }} disabled={loading}>
                      Change
                    </button>
                  </div>
                </div>
              )}
              {phoneError && <p style={{ margin: 0, fontSize: 13, color: "#ef4444" }}>⚠️ {phoneError}</p>}
            </div>
          )}
        </div>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      {/* ── Documents ─────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>Identity Document Verification</h3>
            <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>
              Complete all 3 steps below. Our team will manually review your documents to verify your identity.
            </p>
          </div>
          {identityData?.id_document_verified && (
            <span className="badge" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", fontSize: 13, padding: "6px 14px", flexShrink: 0 }}>Fully Verified</span>
          )}
        </div>

        {/* Step cards.
            Each step leads with a drawing of the thing to photograph rather
            than with its number — the numbers are the one part of this a
            merchant can already infer from the order, and "which side of the
            card is this asking for" is the part they cannot. */}
        {([
          {
            step: 1,
            title: "Front of ID / Passport",
            desc: "Upload a clear photo of the front of your National ID Card or Passport.",
            field: "id_document",
            done: !!identityData?.id_document,
            Glyph: IdFrontGlyph,
          },
          {
            step: 2,
            title: "Back of ID Card",
            desc: "Upload the back side of your ID card.",
            field: "id_document_back",
            done: !!identityData?.id_document_back,
            Glyph: IdBackGlyph,
          },
          {
            step: 3,
            title: "Selfie Holding Your ID",
            desc: "Take a clear photo of yourself holding the front of your ID next to your face. This confirms you are the document holder.",
            field: "selfie_with_id",
            done: !!identityData?.selfie_with_id,
            Glyph: SelfieIdGlyph,
          },
        ] as Array<{
          step: number;
          title: string;
          desc: string;
          field: string;
          done: boolean;
          optional?: boolean;
          Glyph: (p: { size?: number }) => React.ReactElement;
        }>).map(({ step, title, desc, field, done, optional, Glyph }) => (
          <div key={step} style={{
            display: "flex", alignItems: "flex-start", gap: 16, padding: 20,
            border: `1px solid ${done ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
            /* Was a hard-coded "white", which is the paper colour on one
               theme only — on dark it put a white card behind light text. */
            background: done ? "rgba(34,197,94,0.03)" : "var(--surface-900)",
          }}>
            {/* The plate sets `color`, and the glyph's strokes are all
                `currentColor` — so the brand is named once, here, and the
                done state recolours the drawing by changing one value. */}
            <div style={{
              width: 52, height: 52, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: done ? "rgba(34,197,94,0.12)" : "var(--brand-tint)",
              border: `1px solid ${done ? "rgba(34,197,94,0.35)" : "var(--brand-tint-border)"}`,
              color: done ? "#22c55e" : "var(--brand-text)",
            }}>
              {done ? <UploadedGlyph size={26} /> : <Glyph size={28} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h4>
                {optional && <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Optional</span>}
                {done && <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>Uploaded</span>}
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-secondary)" }}>{desc}</p>
              {/* A dashed brand-tinted target rather than a grey button: the
                  action is "put a file here", and a dashed edge is the one
                  affordance people already read that way. */}
              <label style={{
                display: "inline-flex", alignItems: "center", gap: 9,
                padding: "10px 16px",
                border: "1.5px dashed var(--brand-tint-border)",
                background: "var(--brand-tint)",
                color: "var(--brand-text)",
                fontSize: 14, fontWeight: 600,
                cursor: loading ? "progress" : "pointer",
                opacity: loading ? 0.7 : 1,
                transition: "opacity .15s",
              }}>
                <UploadGlyph size={19} />
                {loading ? "Uploading…" : done ? "Replace photo" : "Upload photo"}
                <input type="file" accept="image/*,.pdf" hidden
                  onChange={(e) => handleDocumentUpload(e, field)} disabled={loading} />
              </label>
            </div>
          </div>
        ))}

        {/* Verification Status Card */}
        {!loadingIdentity && (identityData?.id_document || identityData?.id_document_back || identityData?.selfie_with_id) && (
          <div style={{
            padding: 20,
            border: "1px solid var(--border)",
            background: "var(--surface-900)",
            display: "flex", flexDirection: "column", gap: 12,
            borderRadius: 8,
          }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Verification Status</p>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                fontSize: 15, fontWeight: 600,
                color: identityData?.id_document_verified ? "#22c55e" :
                  identityData?.verification_status === "Refused" ? "#ef4444" : "var(--brand-500)",
              }}>
                {identityData?.id_document_verified && "Approved"}
                {!identityData?.id_document_verified && identityData?.verification_status === "Refused" && "Refused"}
                {!identityData?.id_document_verified && identityData?.verification_status !== "Refused" && "In Review"}
              </span>
            </div>

            {!identityData?.id_document_verified && identityData?.verification_status !== "Refused" && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                Your document is under review check back in 5 mins
              </p>
            )}

            {identityData?.warnings?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: "#ef4444" }}>Feedback</p>
                {identityData.warnings.map((w: any, i: number) => (
                  <p key={i} style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>- {w.message || JSON.stringify(w)}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

        <div>
          <h4 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>Business Registration Document</h4>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-muted)" }}>If your store is registered, upload your business certificate here.</p>
          <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer", display: "inline-block" }}>
            {loading ? "Uploading..." : "Upload Business Document"}
            <input type="file" accept=".pdf,image/*" hidden onChange={(e) => handleDocumentUpload(e, "business_document")} disabled={loading} />
          </label>
        </div>
      </div>
    </div>
  );
}

function DomainTab() {
  const [domainSearch, setDomainSearch] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [connectedDomain, setConnectedDomain] = useState<string | null>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [loading, setLoading] = useState(false);

  // What a merchant is told to set at their own registrar to point a domain
  // they own at their Koraa store. 76.76.21.21 is Vercel's apex address; the
  // CNAME host has to be a name that actually resolves under the root domain,
  // so `cname` needs its own CNAME to cname.vercel-dns.com at our registrar —
  // without it these instructions send merchants to a name that answers
  // nothing, and the failure looks like their registrar's fault.
  const [dnsRecords, setDnsRecords] = useState([
    { id: 1, type: "A Record", host: "@", value: "76.76.21.21" },
    { id: 2, type: "CNAME", host: "www", value: `cname.${ROOT_DOMAIN}` },
  ]);
  const [editingDnsId, setEditingDnsId] = useState<number | null>(null);
  const [editDnsType, setEditDnsType] = useState("");
  const [editDnsHost, setEditDnsHost] = useState("");
  const [editDnsValue, setEditDnsValue] = useState("");

  const startEditingDns = (r: any) => {
    setEditingDnsId(r.id);
    setEditDnsType(r.type);
    setEditDnsHost(r.host);
    setEditDnsValue(r.value);
  };

  const saveDnsEdit = (id: number) => {
    setDnsRecords(dnsRecords.map(r => r.id === id ? { ...r, type: editDnsType, host: editDnsHost, value: editDnsValue } : r));
    setEditingDnsId(null);
    toast.success("DNS record updated");
  };

  useEffect(() => {
    storeApi.list().then(res => {
      const fetchedStores = res.data?.results || res.data || [];
      setStores(fetchedStores);
      if (fetchedStores.length > 0) {
        setSelectedStoreId(fetchedStores[0].id);
      }
    }).catch(() => {
      toast.error("Failed to load stores");
    });
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainSearch) return;
    toast.success(`Domain ${domainSearch} is available! Proceed to checkout.`);
  };

  const handlePlug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDomain || !selectedStoreId) return toast.error("Please provide a domain and select a store.");
    
    try {
      setLoading(true);
      await storeApi.update(selectedStoreId, { custom_domain: customDomain });
      setConnectedDomain(customDomain);
      toast.success(`Custom domain ${customDomain} linked! Please update your DNS records.`);
      
      // Update local state to show the new domain in the list
      setStores(stores.map(s => s.id === selectedStoreId ? { ...s, custom_domain: customDomain } : s));
      setCustomDomain("");
    } catch {
      toast.error("Failed to connect domain. It may already be in use.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (storeId: string) => {
    try {
      await storeApi.update(storeId, { custom_domain: "" });
      setStores(stores.map(s => s.id === storeId ? { ...s, custom_domain: "" } : s));
      toast.success("Domain disconnected successfully.");
    } catch {
      toast.error("Failed to disconnect domain.");
    }
  };

  const activeDomains = stores.filter(s => s.custom_domain);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* Active Domains List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Active Domains</h3>
        
        {activeDomains.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {activeDomains.map(store => (
              <div key={store.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: 0 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <p style={{ margin: 0, fontWeight: 500, fontSize: 15 }}>{store.custom_domain}</p>
                    {store.domain_verified ? (
                      <span className="badge" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>Verified</span>
                    ) : (
                      <span className="badge" style={{ background: "rgba(234,179,8,0.1)", color: "#eab308" }}>Pending</span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                    Linked to: {store.name} • {store.domain_expires_at ? `Expires ${new Date(store.domain_expires_at).toLocaleDateString()}` : "No expiration set"}
                  </p>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => handleDisconnect(store.id)}>Disconnect</button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 24, border: "1px dashed var(--border)", borderRadius: 0 }}>
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14 }}>No custom domains connected.</p>
          </div>
        )}
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      {connectedDomain ? (
        <div style={{ padding: 24, background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>{connectedDomain}</h3>
              <span className="badge" style={{ background: "rgba(234,179,8,0.1)", color: "#eab308" }}>Pending Verification</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setConnectedDomain(null)}>Remove</button>
          </div>
          
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--text-secondary)" }}>
            To finish connecting your domain, log in to your domain provider and update your DNS settings with the following records:
          </p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {dnsRecords.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 16, padding: 12, background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: 0, alignItems: "center" }}>
                {editingDnsId === r.id ? (
                  <>
                    <div style={{ flex: 1 }}>
                      <input className="input" value={editDnsType} onChange={e => setEditDnsType(e.target.value)} placeholder="Type" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <input className="input" value={editDnsHost} onChange={e => setEditDnsHost(e.target.value)} placeholder="Host" />
                    </div>
                    <div style={{ flex: 2 }}>
                      <input className="input" value={editDnsValue} onChange={e => setEditDnsValue(e.target.value)} placeholder="Value" />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => saveDnsEdit(r.id)}>Save</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditingDnsId(null)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1 }}><span style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Type</span><strong>{r.type}</strong></div>
                    <div style={{ flex: 1 }}><span style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Name / Host</span><strong>{r.host}</strong></div>
                    <div style={{ flex: 2 }}><span style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Value / Target</span><strong>{r.value}</strong></div>
                    <div>
                      <button className="btn btn-secondary btn-sm" onClick={() => startEditingDns(r)}>Edit</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          
          <p style={{ margin: "16px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            Note: DNS changes can take up to 48 hours to propagate globally.
          </p>
        </div>
      ) : (
        <>
          <form onSubmit={handleSearch} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Buy a New Domain</h3>
            <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>Search and buy a domain directly on Koraa.</p>
            <div style={{ display: "flex", gap: 12 }}>
              <input className="input" placeholder="e.g. mystore.com" value={domainSearch} onChange={(e) => setDomainSearch(e.target.value)} style={{ flex: 1 }} />
              <button type="submit" className="btn btn-primary">Search</button>
            </div>
          </form>

          <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

          <form onSubmit={handlePlug} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Connect Existing Domain</h3>
            <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>Link a domain you already own to one of your stores.</p>
            
            <div className="form-control">
              <label className="label">Select Store</label>
              <select className="input" value={selectedStoreId} onChange={e => setSelectedStoreId(e.target.value)} required>
                {stores.map(store => (
                  <option key={store.id} value={store.id}>{store.name} ({storefrontHost(store.slug)})</option>
                ))}
              </select>
            </div>

            <div className="form-control">
              <label className="label">Custom Domain</label>
              <div style={{ display: "flex", gap: 12 }}>
                <input className="input" placeholder="e.g. shop.mybrand.com" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} style={{ flex: 1 }} required />
                <button type="submit" className="btn btn-secondary" disabled={loading}>{loading ? "Connecting..." : "Connect Domain"}</button>
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

function PayoutTab() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [provider, setProvider] = useState("MTN");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProvider, setEditProvider] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editName, setEditName] = useState("");

  const loadPayouts = async () => {
    setLoading(true);
    try {
      const res = await merchantApi.payouts.list();
      setPayouts(res.data?.results || res.data || []);
    } catch {
      toast.error("Failed to load payout accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayouts();
  }, []);



  const handleAddPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !name) return;
    
    try {
      await merchantApi.payouts.add({ provider, name, phone });
      toast.success(`${provider} Mobile Money account added!`);
      setPhone("");
      setName("");
      loadPayouts();
    } catch {
      toast.error("Failed to add payout account.");
    }
  };

  const startEditing = (p: any) => {
    setEditingId(p.id);
    setEditProvider(p.provider);
    setEditPhone(p.phone);
    setEditName(p.name);
  };

  const saveEdit = async (id: string) => {
    try {
      await merchantApi.payouts.update(id, { provider: editProvider, name: editName, phone: editPhone });
      setEditingId(null);
      toast.success("Account updated");
      loadPayouts();
    } catch {
      toast.error("Failed to update account.");
    }
  };

  const removeAccount = async (id: string) => {
    if (!confirm("Are you sure you want to remove this account?")) return;
    try {
      await merchantApi.payouts.remove(id);
      toast.success("Account removed");
      loadPayouts();
    } catch {
      toast.error("Failed to remove account.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Payout Accounts</h3>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>Manage where your earnings are sent.</p>
        
        {payouts.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {payouts.map(account => (
              <div key={account.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: 0 }}>
                {editingId === account.id ? (
                  <div style={{ display: "flex", gap: 12, flex: 1, alignItems: "center" }}>
                    <select className="input" value={editProvider} onChange={(e) => setEditProvider(e.target.value)}>
                      <option value="MTN">MTN</option>
                      <option value="Orange">Orange</option>
                    </select>
                    <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" />
                    <input className="input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone" />
                    <button className="btn btn-primary btn-sm" onClick={() => saveEdit(account.id)}>Save</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 0, background: account.provider === "MTN" ? "#facc15" : "#f97316", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: "bold" }}>
                        {account.provider === "MTN" ? "MTN" : "OM"}
                      </div>
                      <div>
                        <p style={{ margin: "0 0 4px", fontWeight: 500 }}>{account.name}</p>
                        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>{account.provider} Mobile Money • {account.phone}</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => startEditing(account)}>Edit</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => removeAccount(account.id)}>Remove</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 24, border: "1px dashed var(--border)", borderRadius: 0 }}>
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14 }}>No payout accounts added yet.</p>
          </div>
        )}
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      <form onSubmit={handleAddPayout} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Add Mobile Money Account</h3>
        <div className="form-control">
          <label className="label">Provider</label>
          <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="MTN">MTN Mobile Money</option>
            <option value="Orange">Orange Money</option>
          </select>
        </div>
        <div className="form-control">
          <label className="label">Registered Name</label>
          <div style={{ position: "relative" }}>
            <input 
              className="input" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              required 
              placeholder="e.g. John Doe"
            />
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
            Please enter the exact name registered to this Mobile Money account.
          </p>
        </div>
        <div className="form-control">
          <label className="label">Phone Number</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="e.g. 670000000" />
        </div>
        <div>
          <button type="submit" className="btn btn-primary">Add Account</button>
        </div>
      </form>
    </div>
  );
}

function SecurityTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Security Settings</h3>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, background: "var(--surface-900)", border: "1px solid var(--border)" }}>
        <div>
          <p style={{ margin: "0 0 4px", fontWeight: 500 }}>Two-Factor Authentication (2FA)</p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Add an extra layer of security to your account.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => toast.success("Feature coming soon")}>Enable</button>
      </div>
    </div>
  );
}

function TeamTab() {
  const { user } = useAuthStore();
  const [members, setMembers] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("manager");
  const [inviteStore, setInviteStore] = useState("");
  const [inviting, setInviting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [teamRes, storeRes] = await Promise.all([
        teamApi.list(),
        storeApi.list(),
      ]);
      setMembers(teamRes.data?.results || teamRes.data || []);
      const storeList = storeRes.data?.results || storeRes.data || [];
      // Only stores you own can be shared. The list also carries stores others
      // shared with you, and passing one of those back would be rejected —
      // an invite may only give away your own shop.
      const mine = storeList.filter((s: any) => s.is_owner !== false);
      setStores(mine);
      if (mine.length && !inviteStore) setInviteStore(mine[0]?.id || "");
    } catch {
      toast.error("Failed to load team data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    if (!inviteStore) {
      toast.error("Create a store before inviting teammates.");
      return;
    }
    setInviting(true);
    try {
      await teamApi.invite(inviteEmail, inviteRole, inviteStore);
      const shared = stores.find(s => s.id === inviteStore);
      toast.success(
        shared
          ? `Invited ${inviteEmail} to ${shared.name}. It appears in their dashboard once they accept.`
          : `Invitation sent to ${inviteEmail}!`
      );
      setInviteEmail("");
      setShowInvite(false);
      loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.error || "Failed to invite member.";
      toast.error(msg);
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from your team?`)) return;
    try {
      await teamApi.remove(id);
      toast.success(`${name} removed from team.`);
      loadData();
    } catch {
      toast.error("Failed to remove member.");
    }
  };

  /* Three roles, three semantic tokens. Admin takes the brand, the other
     two the app's info teal and success green — all *-text tokens, so the
     badge stays legible on the card in both themes rather than being a
     fixed violet/blue/green set that only worked on paper. */
  const ROLE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    admin:   { label: "Admin",   color: "var(--brand-text)",   bg: "color-mix(in srgb, var(--brand-text) 12%, transparent)" },
    manager: { label: "Manager", color: "var(--info-text)",    bg: "color-mix(in srgb, var(--info-text) 12%, transparent)" },
    support: { label: "Support", color: "var(--success-text)", bg: "color-mix(in srgb, var(--success-text) 12%, transparent)" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>Team Members</h3>
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>
            Invite teammates to manage your stores. They can edit store details and add products.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowInvite(v => !v)}>
          {showInvite ? "Cancel" : "+ Invite Member"}
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <form onSubmit={handleInvite} style={{ background: "var(--brand-tint)", border: "1.5px solid var(--brand-tint-border)", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* --brand-text, not --brand-700: 700 is a fill weight, and as text
              on the dark theme's ground it is nearly black on near-black. */}
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--brand-text)" }}>Invite a Team Member</h4>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
            The person must already have a Koraa account. They get access to the one store you pick, once they accept the invite.
          </p>
          <div className="mobile-stack-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Email Address</label>
              <input
                className="input"
                type="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Role</label>
              {/* A label for your own records. Every teammate gets the same
                  powers on the store you share — see the note below. */}
              <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                <option value="manager">Store Manager</option>
                <option value="admin">Admin</option>
                <option value="support">Customer Support</option>
              </select>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>A label for your records — it does not change what they can do.</p>
            </div>
          </div>
          {stores.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Store to share</label>
              <select className="input" value={inviteStore} onChange={e => setInviteStore(e.target.value)} required>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({storefrontHost(s.slug)})</option>
                ))}
              </select>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Only this store. Your other stores stay private.</p>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: "#d97706" }}>
              You need a store before you can invite anyone — an invite shares one specific store.
            </p>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={inviting || !stores.length}>
              {inviting ? "Sending…" : "Send Invitation"}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowInvite(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Members list */}
      {loading ? (
        <div style={{ padding: 32, textAlign: "center" }}>
          <LuLoader size={24} className="spin" color="var(--brand-600)" style={{ margin: "0 auto" }} />
        </div>
      ) : members.length === 0 ? (
        <div style={{ padding: 48, border: "1px dashed var(--border)", textAlign: "center" }}>
          <LuUsers size={32} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
          <p style={{ margin: "0 0 4px", fontWeight: 600, color: "var(--text-primary)" }}>No team members yet</p>
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>Invite a teammate to collaborate on your store.</p>
        </div>
      ) : (
        <div className="table-responsive" style={{ border: "1px solid var(--border)" }}>
          <div style={{ minWidth: 700, display: "flex", flexDirection: "column", gap: 0, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto auto", gap: 16, padding: "10px 20px", background: "var(--surface-850)", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <span>Member</span>
            <span>Store Access</span>
            <span>Role</span>
            <span>Status</span>
            <span></span>
          </div>
          {members.map((m, i) => {
            const roleInfo = ROLE_LABELS[m.role] || ROLE_LABELS.manager;
            const isPending = m.status === "pending";
            return (
              <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto auto", gap: 16, padding: "16px 20px", alignItems: "center", background: i % 2 === 0 ? "white" : "var(--surface-950)", borderTop: "1px solid var(--border)" }}>
                <div>
                  <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: 15 }}>{m.full_name || m.email}</p>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>{m.email}</p>
                </div>
                <div>
                  {/* The store named on the invite. This used to list every
                      store the owner had, which claimed access the teammate
                      did not have. */}
                  <span style={{ fontSize: 13, color: m.store ? "var(--text-secondary)" : "var(--text-muted)" }}>
                    {m.store_name || "—"}
                  </span>
                </div>
                <span style={{ padding: "4px 10px", borderRadius: 4, fontSize: 12, fontWeight: 700, background: roleInfo.bg, color: roleInfo.color, whiteSpace: "nowrap", textAlign: "center" }}>
                  {roleInfo.label}
                </span>
                
                {/* Status Badge */}
                <span style={{
                  padding: "4px 10px", borderRadius: 4, fontSize: 12, fontWeight: 700, textAlign: "center", whiteSpace: "nowrap",
                  background: isPending ? "rgba(245,158,11,0.1)" : m.status === "rejected" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
                  color: isPending ? "#d97706" : m.status === "rejected" ? "#dc2626" : "#16a34a",
                }}>
                  {isPending ? "Pending Invite" : m.status === "rejected" ? "Declined" : "Active"}
                </span>

                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleRemove(m.id, m.full_name || m.email)}
                  style={{ whiteSpace: "nowrap", background: isPending ? "white" : undefined, color: isPending ? "var(--danger)" : undefined }}
                >
                  {isPending ? "Cancel Invite" : "Remove"}
                </button>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* Info box */}
      <div style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)", padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <LuBadgeCheck size={18} color="#3b82f6" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 13, color: "#1d4ed8", lineHeight: 1.5 }}>
          <strong>How it works:</strong> An invite shares one store. Once the teammate accepts, that store — and only that store — appears in their dashboard, where they can manage products, orders, and the storefront design, and publish it. Deleting the store, inviting others, and billing stay with you.
        </p>
      </div>
    </div>
  );
}

function DeliveryTab() {
  const [persons, setPersons] = useState<any[]>([]);
  const [agencies, setAgencies] = useState<any[]>([]);
  
  const [personName, setPersonName] = useState("");
  const [personPhone, setPersonPhone] = useState("");
  
  const [agencyName, setAgencyName] = useState("");
  const [agencyPhone, setAgencyPhone] = useState("");

  const [editingPersonId, setEditingPersonId] = useState<number | null>(null);
  const [editPersonName, setEditPersonName] = useState("");
  const [editPersonPhone, setEditPersonPhone] = useState("");

  const [editingAgencyId, setEditingAgencyId] = useState<number | null>(null);
  const [editAgencyName, setEditAgencyName] = useState("");
  const [editAgencyPhone, setEditAgencyPhone] = useState("");

  const handleAddPerson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personName || !personPhone) return;
    setPersons([...persons, { id: Date.now(), name: personName, phone: personPhone }]);
    toast.success(`Delivery person ${personName} added!`);
    setPersonName("");
    setPersonPhone("");
  };

  const handleAddAgency = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agencyName || !agencyPhone) return;
    setAgencies([...agencies, { id: Date.now(), name: agencyName, phone: agencyPhone }]);
    toast.success(`Delivery agency ${agencyName} added!`);
    setAgencyName("");
    setAgencyPhone("");
  };

  const startEditingPerson = (p: any) => {
    setEditingPersonId(p.id);
    setEditPersonName(p.name);
    setEditPersonPhone(p.phone);
  };

  const savePersonEdit = (id: number) => {
    setPersons(persons.map(p => p.id === id ? { ...p, name: editPersonName, phone: editPersonPhone } : p));
    setEditingPersonId(null);
    toast.success("Delivery person updated");
  };

  const startEditingAgency = (a: any) => {
    setEditingAgencyId(a.id);
    setEditAgencyName(a.name);
    setEditAgencyPhone(a.phone);
  };

  const saveAgencyEdit = (id: number) => {
    setAgencies(agencies.map(a => a.id === id ? { ...a, name: editAgencyName, phone: editAgencyPhone } : a));
    setEditingAgencyId(null);
    toast.success("Agency updated");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* In-Town Delivery Persons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>In-Town Delivery Persons</h3>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>Manage dispatch riders or local delivery agents for local deliveries.</p>
        
        {persons.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {persons.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: 0 }}>
                {editingPersonId === p.id ? (
                  <div className="mobile-stack-grid" style={{ display: "flex", gap: 12, flex: 1, alignItems: "center" }}>
                    <input className="input" value={editPersonName} onChange={e => setEditPersonName(e.target.value)} placeholder="Name" />
                    <input className="input" value={editPersonPhone} onChange={e => setEditPersonPhone(e.target.value)} placeholder="Phone" />
                    <button className="btn btn-primary btn-sm" onClick={() => savePersonEdit(p.id)}>Save</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingPersonId(null)}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p style={{ margin: "0 0 4px", fontWeight: 500 }}>{p.name}</p>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>{p.phone}</p>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => startEditingPerson(p)}>Edit</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setPersons(persons.filter(x => x.id !== p.id))}>Remove</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 24, border: "1px dashed var(--border)", borderRadius: 0 }}>
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14 }}>No delivery persons added yet.</p>
          </div>
        )}

        <form onSubmit={handleAddPerson} className="mobile-stack-grid" style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <input className="input" placeholder="Name" value={personName} onChange={e => setPersonName(e.target.value)} required />
          <input className="input" placeholder="Phone" value={personPhone} onChange={e => setPersonPhone(e.target.value)} required />
          <button type="submit" className="btn btn-secondary">Add Person</button>
        </form>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      {/* Far Delivery Agencies */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Far Delivery Agencies</h3>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>Manage travel agencies or courier companies for inter-city/distant deliveries.</p>
        
        {agencies.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {agencies.map(a => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: 0 }}>
                {editingAgencyId === a.id ? (
                  <div className="mobile-stack-grid" style={{ display: "flex", gap: 12, flex: 1, alignItems: "center" }}>
                    <input className="input" value={editAgencyName} onChange={e => setEditAgencyName(e.target.value)} placeholder="Agency Name" />
                    <input className="input" value={editAgencyPhone} onChange={e => setEditAgencyPhone(e.target.value)} placeholder="Contact Phone" />
                    <button className="btn btn-primary btn-sm" onClick={() => saveAgencyEdit(a.id)}>Save</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingAgencyId(null)}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p style={{ margin: "0 0 4px", fontWeight: 500 }}>{a.name}</p>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>{a.phone}</p>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => startEditingAgency(a)}>Edit</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setAgencies(agencies.filter(x => x.id !== a.id))}>Remove</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 24, border: "1px dashed var(--border)", borderRadius: 0 }}>
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14 }}>No agencies added yet.</p>
          </div>
        )}

        <form onSubmit={handleAddAgency} className="mobile-stack-grid" style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <input className="input" placeholder="Agency Name" value={agencyName} onChange={e => setAgencyName(e.target.value)} required />
          <input className="input" placeholder="Contact Phone" value={agencyPhone} onChange={e => setAgencyPhone(e.target.value)} required />
          <button type="submit" className="btn btn-secondary">Add Agency</button>
        </form>
      </div>
    </div>
  );
}

function CustomisationTab() {
  const router = useRouter();
  
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Store Customisation</h3>
      <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>Update global branding settings and sections across your store.</p>
      <div style={{ padding: 24, border: "1px dashed var(--border)", borderRadius: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16 }}>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14 }}>Use the visual editor to customize your live storefront.</p>
        <button className="btn btn-primary btn-sm" onClick={() => router.push("/dashboard/settings/storefront")}>Open Visual Editor</button>
      </div>
    </div>
  );
}

function CurrencyTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Store Currencies</h3>
      <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>Manage which currencies your store accepts.</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, background: "var(--surface-900)", border: "1px solid var(--border)" }}>
        <div>
          <p style={{ margin: "0 0 4px", fontWeight: 500 }}>Base Currency</p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>XAF (Central African CFA Franc)</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => toast.success("Feature coming soon")}>Change</button>
      </div>
    </div>
  );
}

function NotificationTab() {
  const [channels, setChannels] = useState({
    whatsapp: true,
    email: true,
    dm: false,
    inApp: true,
  });

  const handleToggle = (channel: keyof typeof channels) => {
    setChannels({ ...channels, [channel]: !channels[channel] });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Notification Preferences</h3>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>Choose how and when you want to be notified.</p>
      </div>
      
      <div style={{ padding: 24, background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: 0 }}>
        <h4 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>New Orders Placed</h4>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--text-secondary)" }}>Select where you want to receive notifications when a customer places a new order.</p>
        
        <div className="mobile-stack-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={channels.whatsapp} onChange={() => handleToggle("whatsapp")} style={{ width: 18, height: 18 }} />
            <span style={{ fontSize: 14, fontWeight: 500 }}>WhatsApp</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={channels.email} onChange={() => handleToggle("email")} style={{ width: 18, height: 18 }} />
            <span style={{ fontSize: 14, fontWeight: 500 }}>Email</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={channels.dm} onChange={() => handleToggle("dm")} style={{ width: 18, height: 18 }} />
            <span style={{ fontSize: 14, fontWeight: 500 }}>Direct Message (SMS)</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={channels.inApp} onChange={() => handleToggle("inApp")} style={{ width: 18, height: 18 }} />
            <span style={{ fontSize: 14, fontWeight: 500 }}>In-App Notifications</span>
          </label>
        </div>
      </div>
      
      <div style={{ padding: 24, background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: 0 }}>
        <h4 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Other Alerts</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {["Low Stock Alerts", "Payout Updates", "Marketing Emails"].map(item => (
            <label key={item} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
              <input type="checkbox" defaultChecked style={{ width: 16, height: 16 }} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>{item}</span>
            </label>
          ))}
        </div>
      </div>
      
      <div>
        <button className="btn btn-primary" onClick={() => toast.success("Preferences saved")}>Save Preferences</button>
      </div>
    </div>
  );
}

function RefundsTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Refund Policies</h3>
      <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>Configure how refunds and returns are handled.</p>
      <div className="form-control">
        <label className="label">Return Policy URL</label>
        <input className="input" placeholder="https://yourstore.com/returns" />
      </div>
      <div className="form-control">
        <label className="label">Refund Instructions</label>
        <textarea className="input" style={{ minHeight: 100 }} placeholder="Instructions for customers on how to request a refund..." />
      </div>
      <div>
        <button className="btn btn-primary btn-sm" onClick={() => toast.success("Policy saved")}>Save Policy</button>
      </div>
    </div>
  );
}

// ─── Referral Tab ────────────────────────────────────────────────────────────

function ReferralTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReferrals = async () => {
      try {
        const res = await authApi.getReferrals();
        setStats(res.data);
      } catch {
        toast.error("Failed to load referrals data");
      } finally {
        setLoading(false);
      }
    };
    fetchReferrals();
  }, []);

  const copyLink = () => {
    if (stats?.referral_link) {
      navigator.clipboard.writeText(stats.referral_link);
      toast.success("Referral link copied!");
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <LuLoader size={24} className="spin" color="var(--brand-600)" style={{ margin: "0 auto" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, width: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Refer a Friend</h3>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>
          Invite other merchants to Koraa and earn rewards when they upgrade to a paid plan.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <div style={{ padding: 20, background: "var(--surface-900)", border: "1px solid var(--border)" }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>Total Referred</p>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{stats?.total_referred || 0}</p>
        </div>
        <div style={{ padding: 20, background: "var(--surface-900)", border: "1px solid var(--border)" }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>Total Earned</p>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--brand-600)" }}>{stats?.total_earned || 0} XAF</p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label className="label">Your unique referral link</label>
        <div className="mobile-stack-flex" style={{ display: "flex", gap: 12 }}>
          <input className="input" value={stats?.referral_link || ""} readOnly style={{ flex: 1, background: "var(--surface-900)" }} />
          <button className="btn btn-primary" onClick={copyLink} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
            <LuCopy size={16} /> Copy Link
          </button>
        </div>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", minWidth: 0 }}>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Your Referrals</h4>
        
        {stats?.referrals?.length === 0 ? (
          <div style={{ padding: 48, border: "1px dashed var(--border)", textAlign: "center" }}>
            <LuGift size={32} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
            <p style={{ margin: "0 0 4px", fontWeight: 600, color: "var(--text-primary)" }}>No referrals yet</p>
            <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>Share your link to start earning!</p>
          </div>
        ) : (
          <div className="table-responsive" style={{ border: "1px solid var(--border)", width: "100%" }}>
            <div style={{ minWidth: 600, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 16, padding: "10px 20px", background: "var(--surface-850)", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                <span>User</span>
                <span>Date</span>
                <span>Reward</span>
                <span>Status</span>
              </div>
              {stats?.referrals?.map((ref: any, i: number) => (
                <div key={ref.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 16, padding: "16px 20px", alignItems: "center", background: i % 2 === 0 ? "white" : "var(--surface-950)", borderTop: "1px solid var(--border)" }}>
                  <div>
                    <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: 14 }}>{ref.referred_user_name}</p>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>{ref.referred_user_email}</p>
                  </div>
                  <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>{new Date(ref.created_at).toLocaleDateString()}</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{ref.reward_amount} XAF</span>
                  <span style={{
                    padding: "4px 10px", borderRadius: 4, fontSize: 12, fontWeight: 700, textAlign: "center", whiteSpace: "nowrap",
                    background: ref.status === "completed" ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)",
                    color: ref.status === "completed" ? "#16a34a" : "#d97706"
                  }}>
                    {ref.status === "completed" ? "Completed" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabParam || "profile");
  const [isTabLoading, setIsTabLoading] = useState(false);

  // Follow ?tab= when the *param* changes — arriving from a deep link such as
  // the header avatar's ?tab=profile, or the browser back button.
  //
  // `activeTab` must NOT be a dependency: with it here, clicking a tab set the
  // state, re-ran this effect, saw the still-unchanged param disagree, and
  // snapped straight back — which locked the panel on whichever tab the URL
  // named. Keeping the URL in step below is what makes the two agree.
  useEffect(() => {
    if (tabParam) setActiveTab(tabParam);
  }, [tabParam]);

  const handleTabChange = (tabId: string) => {
    if (tabId === activeTab) return;
    setIsTabLoading(true);
    setActiveTab(tabId);
    // Keep the URL in step so the tab survives a reload and the back button
    // walks the tabs, rather than leaving a stale ?tab= to fight the state.
    router.replace(`/dashboard/settings?tab=${tabId}`, { scroll: false });
    setTimeout(() => setIsTabLoading(false), 800);
  };

  return (
    <>
      <PageTitle title="Settings — Koraa Dashboard" />
      <>

        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
          marginTop: 24,
          minHeight: "calc(100vh - 120px)"
        }}>
          {/* Main Settings Container */}
          <div className="settings-layout">

            {/* Left Sidebar Menu */}
            <div className="settings-tabs">
              {SETTINGS_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      background: isActive ? "var(--surface-900)" : "transparent",
                      color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                      border: "none",
                      boxShadow: isActive ? "var(--shadow-xs)" : "none",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 14,
                      fontWeight: isActive ? 600 : 500,
                      transition: "all 0.2s ease"
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = "var(--surface-850)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {isTabLoading && activeTab === tab.id ? (
                      <LuLoader size={18} className="spin" />
                    ) : (
                      <Icon size={18} />
                    )}
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Right Content Area */}
            <div className="card" style={{ padding: "24px", minHeight: 400, minWidth: 0 }}>
              <div style={{ marginBottom: 32 }}>
                <h2 className="font-display" style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px 0" }}>
                  {SETTINGS_TABS.find(t => t.id === activeTab)?.label}
                </h2>
                <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: 14 }}>
                  Manage your {SETTINGS_TABS.find(t => t.id === activeTab)?.label.toLowerCase()} settings and preferences.
                </p>
              </div>

              <div style={{ opacity: isTabLoading ? 0.5 : 1, transition: "opacity 0.2s" }}>
                {activeTab === "profile" && <ProfileTab />}
              {activeTab === "plan" && <PlanTab />}
              {activeTab === "identity" && <IdentityTab />}
              {activeTab === "domain" && <DomainTab />}
              {activeTab === "payout" && <PayoutTab />}
              {activeTab === "security" && <SecurityTab />}
              {activeTab === "team" && <TeamTab />}
              {activeTab === "delivery" && <DeliveryTab />}
              {activeTab === "customisation" && <CustomisationTab />}
              {activeTab === "currency" && <CurrencyTab />}
              {activeTab === "notification" && <NotificationTab />}
              {activeTab === "refunds" && <RefundsTab />}
              {activeTab === "referrals" && <ReferralTab />}
              </div>
            </div>

          </div>
        </div>

        {/* Responsive CSS for Settings */}
        <style jsx>{`
          @media (max-width: 768px) {
            .settings-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LuLoader size={28} className="spin" color="var(--brand-500)" />
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
