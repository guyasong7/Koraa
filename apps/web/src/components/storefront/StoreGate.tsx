"use client";
/**
 * The screen a locked shop shows instead of itself.
 *
 * Two reasons a shop is locked, and they need different screens: a **private**
 * shop cannot be opened by a visitor at all, so asking for a passcode would be
 * a form that can never succeed; a **password** shop can, so it gets one.
 *
 * The passcode is checked by the API, not here. On success the unlock endpoint
 * returns the same payload the public endpoint would have, so the shop is
 * rendered from that response rather than by reloading — a reload would hit the
 * still-locked public endpoint and land straight back on this screen.
 *
 * Nothing is persisted. Sessions, signed cookies or a token in `localStorage`
 * would each be a second thing to get wrong, and a shop passcode is typed once
 * while the merchant is showing someone the shop.
 */
import { useState } from "react";
import { LuLoader, LuLock } from "react-icons/lu";

import { StorefrontProvider } from "../StorefrontProvider";
import { StorefrontRenderer } from "../StorefrontRenderer";
import type { StorefrontData } from "../../types/storefront";
import { STOREFRONT_DEFAULTS } from "./theme";

export interface GatePayload {
  locked: "private" | "password" | string;
  store: {
    name: string;
    slug: string;
    logo: string | null;
    favicon: string | null;
  };
  gate: {
    message: string;
    primary_color: string;
  };
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export function StoreGate({ payload }: { payload: GatePayload }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [unlocked, setUnlocked] = useState<StorefrontData | null>(null);

  if (unlocked) {
    return (
      <StorefrontProvider initialData={unlocked} isPreview={false}>
        <StorefrontRenderer />
      </StorefrontProvider>
    );
  }

  const brand = payload.gate.primary_color || STOREFRONT_DEFAULTS.primary;
  const isPrivate = payload.locked === "private";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passcode.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${API_BASE}/public/storefront/${payload.store.slug}/unlock/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passcode: passcode.trim() }),
        },
      );
      if (response.ok) {
        setUnlocked((await response.json()) as StorefrontData);
        return;
      }
      if (response.status === 429) {
        setError("Too many tries. Wait a minute and try again.");
      } else {
        const body = await response.json().catch(() => null);
        setError(body?.detail || "That passcode is not right.");
      }
    } catch {
      setError("Could not reach the shop. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "40px 20px",
        background: "#fafafa",
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#171717",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        {payload.store.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={payload.store.logo}
            alt={payload.store.name}
            style={{ height: 56, objectFit: "contain", marginBottom: 26 }}
          />
        ) : (
          <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 26 }}>
            {payload.store.name}
          </h1>
        )}

        <div
          style={{
            background: "#fff",
            border: "1px solid rgba(0,0,0,.08)",
            borderRadius: 16,
            padding: "32px 28px",
            boxShadow: "0 10px 40px rgba(0,0,0,.06)",
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 46,
              height: 46,
              borderRadius: "50%",
              background: `${brand}1a`,
              margin: "0 auto 16px",
            }}
          >
            <LuLock size={20} color={brand} />
          </span>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            {isPrivate ? "This shop is private" : "This shop is protected"}
          </h2>

          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: "#525252", margin: 0 }}>
            {payload.gate.message ||
              (isPrivate
                ? "The owner has not opened it to visitors yet."
                : "Enter the passcode the owner gave you to have a look around.")}
          </p>

          {!isPrivate && (
            <form onSubmit={submit} style={{ marginTop: 22 }}>
              <input
                type="password"
                value={passcode}
                onChange={e => {
                  setPasscode(e.target.value);
                  setError("");
                }}
                placeholder="Passcode"
                autoFocus
                aria-label="Passcode"
                aria-invalid={!!error}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: 15,
                  borderRadius: 10,
                  border: `1px solid ${error ? "#ef4444" : "rgba(0,0,0,.14)"}`,
                  outline: "none",
                  background: "#fff",
                  color: "#171717",
                }}
              />

              {error && (
                <p
                  role="alert"
                  style={{ color: "#ef4444", fontSize: 13, marginTop: 9, textAlign: "left" }}
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || !passcode.trim()}
                style={{
                  width: "100%",
                  marginTop: 14,
                  padding: "12px 16px",
                  background: brand,
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: busy || !passcode.trim() ? "default" : "pointer",
                  opacity: busy || !passcode.trim() ? 0.6 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {busy && <LuLoader size={15} className="spin" />}
                {busy ? "Checking…" : "Enter shop"}
              </button>
            </form>
          )}
        </div>

        <p style={{ marginTop: 22, fontSize: 12.5, color: "#a3a3a3" }}>
          Built with{" "}
          <a
            href={process.env.NEXT_PUBLIC_KORAA_URL || "https://koraa.africa"}
            style={{ color: "#737373", fontWeight: 600, textDecoration: "none" }}
          >
            Koraa
          </a>
        </p>
      </div>

      <style>{`
        @keyframes koraa-spin { to { transform: rotate(360deg) } }
        .spin { animation: koraa-spin .8s linear infinite }
      `}</style>
    </main>
  );
}
