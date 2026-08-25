"use client";
import React, { useEffect, useRef, useState } from "react";
import { useNotificationStore, AppNotification } from "@/stores/notifications";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/auth";
import { teamApi } from "@/lib/api";

// ── icons (inline SVGs so no extra deps) ─────────────────────────────────────
const BellIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
const CheckIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const XIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const UsersIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

// ── relative time helper ──────────────────────────────────────────────────────
function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── type colours ─────────────────────────────────────────────────────────────
// Semantic tokens rather than hardcoded rgba: these read as tints on a card,
// and the card is a different colour in each theme — a fixed 8% violet that
// looked right on paper was a smear on the indigo ground. The invite tint is
// the brand's, the other three are the app's success/danger/info, which are a
// green, a pulled-warm red and a teal chosen to sit beside an ochre brand.
function typeStyle(type: string) {
  const tint = (token: string) => ({
    bg: `color-mix(in srgb, var(${token}) 10%, transparent)`,
    border: `color-mix(in srgb, var(${token}) 22%, transparent)`,
    iconColor: `var(${token})`,
  });
  if (type === "team_invite") return { ...tint("--brand-text"), icon: <UsersIcon /> };
  if (type === "team_invite_accepted") return { ...tint("--success-text"), icon: <CheckIcon size={18} /> };
  if (type === "team_invite_rejected") return { ...tint("--danger-text"), icon: <XIcon size={18} /> };
  return { ...tint("--info-text"), icon: <BellIcon size={18} /> };
}

// ── single notification card ─────────────────────────────────────────────────
function NotifCard({ n, onRespond }: { n: AppNotification; onRespond: () => void }) {
  const { markOneRead, respond } = useNotificationStore();
  const [acting, setActing] = useState<"accept" | "reject" | null>(null);
  const s = typeStyle(n.type);

  const handleRespond = async (action: "accept" | "reject") => {
    setActing(action);
    try {
      await respond(n.id, action);
      toast.success(action === "accept" ? "Invite accepted! You can now manage the store." : "Invite declined.");
      onRespond();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Something went wrong.");
    } finally {
      setActing(null);
    }
  };

  return (
    <div
      onClick={() => !n.is_read && markOneRead(n.id)}
      style={{
        padding: "14px 16px",
        background: n.is_read ? "white" : s.bg,
        borderLeft: `3px solid ${n.is_read ? "transparent" : s.border.replace("rgba", "rgba").replace("0.2", "0.6")}`,
        borderBottom: "1px solid var(--border)",
        cursor: "default",
        transition: "background 0.2s",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* Icon */}
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: s.bg, border: `1px solid ${s.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: s.iconColor }}>
          {s.icon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <p style={{ margin: "0 0 3px", fontWeight: n.is_read ? 500 : 700, fontSize: 14, color: "var(--text-primary)", lineHeight: 1.3 }}>
              {n.title}
            </p>
            <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
              {relativeTime(n.created_at)}
            </span>
          </div>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {n.body}
          </p>

          {/* Team invite action buttons */}
          {n.type === "team_invite" && !n.is_read && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={(e) => { e.stopPropagation(); handleRespond("accept"); }}
                disabled={!!acting}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 14px", fontSize: 13, fontWeight: 600,
                  background: "#16a34a", color: "white", border: "none",
                  borderRadius: 0, cursor: "pointer", opacity: acting === "reject" ? 0.5 : 1,
                }}
              >
                {acting === "accept" ? "Accepting…" : <><CheckIcon /> Accept</>}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleRespond("reject"); }}
                disabled={!!acting}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 14px", fontSize: 13, fontWeight: 600,
                  background: "var(--surface-900)", color: "#dc2626",
                  border: "1.5px solid rgba(239,68,68,0.3)",
                  borderRadius: 0, cursor: "pointer", opacity: acting === "accept" ? 0.5 : 1,
                }}
              >
                {acting === "reject" ? "Declining…" : <><XIcon /> Decline</>}
              </button>
            </div>
          )}

          {/* Already acted */}
          {n.type === "team_invite" && n.is_read && (
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
              Already responded
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── main bell component ───────────────────────────────────────────────────────
export default function NotificationBell() {
  const { notifications, unreadCount, loading, fetch, markAllRead } = useNotificationStore();
  const { isAuthenticated } = useAuthStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Initial fetch + 30-second polling
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch();
    const timer = setInterval(fetch, 30_000);
    return () => clearInterval(timer);
  }, [isAuthenticated]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleOpen = () => {
    setOpen((v) => !v);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        style={{
          position: "relative",
          background: "none", border: "none", cursor: "pointer",
          width: 38, height: 38,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "50%",
          color: open ? "var(--brand-600)" : "var(--text-secondary)",
          transition: "color 0.15s, background 0.15s",
        }}
        title="Notifications"
      >
        <BellIcon size={20} />
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: 4, right: 4,
            background: "var(--brand-600)", color: "white",
            fontSize: 10, fontWeight: 800,
            width: 16, height: 16, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            lineHeight: 1,
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 10px)", right: 0,
          width: 400, maxHeight: 540,
          background: "var(--surface-900)",
          border: "1px solid var(--border)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          zIndex: 1000,
          display: "flex", flexDirection: "column",
          animation: "fadeIn 0.15s ease",
        }}>
          {/* Header */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Notifications</span>
              {unreadCount > 0 && (
                <span style={{ marginLeft: 8, background: "var(--brand-100)", color: "var(--brand-700)", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 99 }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{ fontSize: 12, color: "var(--brand-600)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: "4px 8px" }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && notifications.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <BellIcon size={28} />
                <p style={{ marginTop: 12, color: "var(--text-muted)", fontSize: 14 }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotifCard key={n.id} n={n} onRespond={() => { fetch(); setOpen(false); }} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
