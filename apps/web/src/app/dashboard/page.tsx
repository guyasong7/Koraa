"use client";

import PageTitle from "@/components/PageTitle";
import { useAuthStore } from "@/stores/auth";
import { storeApi, merchantApi, analyticsApi, Store } from "@/lib/api";
import { storefrontHost } from "@/lib/rootDomain";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  LuStore, LuPackage, LuShoppingCart, LuTrendingUp, LuArrowUpRight, LuPlus,
  LuGlobe, LuLoader, LuCircle, LuStar, LuChevronRight, LuActivity, LuZap,
  LuExternalLink,
} from "react-icons/lu";
import dynamic from "next/dynamic";

const RevenueChart = dynamic(() => import("@/components/dashboard/RevenueChart"), {
  ssr: false,
  loading: () => <div style={{ height: 220 }} />,
});

const CHART_DAYS = 7;

function chartLabel(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, { weekday: "short" });
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: "Draft",     color: "#64748b", bg: "rgba(100,116,139,0.12)" },
  preview:   { label: "Preview",   color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  published: { label: "Live",      color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  suspended: { label: "Suspended", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

function StoreCard({ store }: { store: Store }) {
  const s = STATUS_CFG[store.status] ?? STATUS_CFG.draft;
  return (
    <div className="store-card">
      <div className="store-card-logo">
        {store.logo
          ? <img src={store.logo} alt={store.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6 }} />
          : <LuGlobe size={20} color="var(--brand-500)" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{store.name}</p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{storefrontHost(store.slug)}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, display: "flex", alignItems: "center", gap: 4 }}>
          {store.status === "published" && <LuCircle size={6} fill={s.color} stroke="none" />}
          {s.label}
        </span>
        <Link href={`/dashboard/stores/${store.id}`} style={{ display: "flex", alignItems: "center", padding: "6px 10px", borderRadius: 8, background: "var(--surface-700)", border: "1px solid var(--border)", color: "var(--text-secondary)", textDecoration: "none", fontSize: 12, fontWeight: 600, gap: 4, transition: "all .15s" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-500)"; (e.currentTarget as HTMLElement).style.color = "var(--brand-500)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
        >
          Manage <LuChevronRight size={13} />
        </Link>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: storesData, isLoading: storesLoading } = useQuery({
    queryKey: ["stores"],
    queryFn: () => storeApi.list().then(r => r.data),
  });
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => merchantApi.getStats().then(r => r.data),
  });
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["analytics", "sales", "", CHART_DAYS],
    queryFn: () => analyticsApi.sales({ days: CHART_DAYS }).then(r => r.data),
  });

  const chartData = (salesData?.series ?? []).map(row => ({
    name: chartLabel(row.date),
    revenue: Number(row.revenue ?? 0),
  }));
  const chartCurrency = salesData?.currency ?? null;
  const mixedCurrencies = !!salesData && salesData.currency === null;

  const stores: Store[] = storesData?.results ?? storesData ?? [];
  const publishedCount = stores.filter(s => s.status === "published").length;
  const firstName = user?.full_name?.split(" ")[0] || "Merchant";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const initials = (user?.full_name ?? "M").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      <PageTitle title="Dashboard — Koraa" />

      <div className="overview-shell">

        {/* ── Top welcome strip ── */}
        <div className="overview-header">
          <div className="overview-avatar">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="overview-greeting">{greeting}</p>
            <h1 className="overview-name">
              {firstName}
              {publishedCount > 0 && (
                <span className="overview-live-badge">
                  <LuCircle size={6} fill="#22c55e" stroke="none" /> {publishedCount} Live
                </span>
              )}
            </h1>
          </div>
          <div className="overview-header-actions">
            {stores.length === 0 ? (
              <Link href="/dashboard/stores" className="btn btn-primary btn-sm">
                <LuPlus size={14} /> Create store
              </Link>
            ) : (
              <>
                <Link href="/dashboard/stores" className="btn btn-secondary btn-sm">
                  <LuStore size={14} /> Stores
                </Link>
                <Link href="/dashboard/products" className="btn btn-primary btn-sm">
                  <LuPackage size={14} /> Products
                </Link>
              </>
            )}
          </div>
        </div>

        {/* ── Stat strip ── */}
        <div className="stat-strip">
          {[
            { label: "Stores",   value: storesLoading ? "…" : stores.length,                                                         icon: LuStore,       color: "var(--brand-500)",   sub: `${publishedCount} live` },
            { label: "Products", value: statsLoading  ? "…" : (statsData?.total_products ?? 0),                                      icon: LuPackage,     color: "var(--clay-text)",   sub: "All stores" },
            { label: "Orders",   value: statsLoading  ? "…" : (statsData?.total_orders ?? 0),                                        icon: LuShoppingCart,color: "#f59e0b",            sub: "All time" },
            { label: "Revenue",  value: statsLoading  ? "…" : `${(statsData?.total_revenue ?? 0).toLocaleString()}${chartCurrency ? ` ${chartCurrency}` : ""}`, icon: LuTrendingUp, color: "var(--info-text)", sub: "This month" },
          ].map(({ label, value, icon: Icon, color, sub }) => (
            <div key={label} className="stat-cell">
              <div className="stat-cell-icon" style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
                <Icon size={16} color={color} />
              </div>
              <div>
                <p className="stat-cell-value">{value}</p>
                <p className="stat-cell-label">{label}</p>
                <p className="stat-cell-sub">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Bento grid ── */}
        <div className="overview-bento">

          {/* Revenue chart — full row */}
          <div className="bento-chart">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>Revenue</h2>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {mixedCurrencies
                    ? "Your shops bill in different currencies"
                    : `Last ${CHART_DAYS} days${chartCurrency ? ` · ${chartCurrency}` : ""}`}
                </p>
              </div>
              <Link href="/dashboard/analytics" className="btn btn-secondary btn-sm">
                Full analytics <LuArrowUpRight size={13} />
              </Link>
            </div>
            {salesLoading ? (
              <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <LuLoader size={22} className="spin" color="var(--brand-500)" />
              </div>
            ) : mixedCurrencies ? (
              <p style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 13, color: "var(--text-muted)", maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
                Different currencies across your stores. Open analytics to see each store in its own currency.
              </p>
            ) : (
              <RevenueChart data={chartData} currency={chartCurrency} />
            )}
          </div>

          {/* Stores list */}
          <div className="bento-stores">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700 }}>Your Stores</h2>
              <Link href="/dashboard/stores" className="btn btn-secondary btn-sm">
                <LuPlus size={13} /> New
              </Link>
            </div>

            {storesLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0" }}>
                <LuLoader size={22} className="spin" color="var(--brand-500)" />
              </div>
            ) : stores.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 16px" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--surface-700)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <LuStore size={20} color="var(--brand-500)" />
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>No stores yet</p>
                <Link href="/dashboard/stores" className="btn btn-primary btn-sm">
                  <LuPlus size={13} /> Create store
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {stores.map(store => <StoreCard key={store.id} store={store} />)}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="bento-actions">
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>Quick Actions</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { icon: LuPlus,      label: "Create store",    sub: "Launch a new storefront",  href: "/dashboard/stores",    color: "var(--brand-500)" },
                { icon: LuPackage,   label: "Add product",     sub: "List items for sale",       href: "/dashboard/products",  color: "var(--clay-text)" },
                { icon: LuActivity,  label: "View analytics",  sub: "Track your performance",    href: "/dashboard/analytics", color: "#f59e0b" },
              ].map(({ icon: Icon, label, sub, href, color }) => (
                <Link key={href} href={href} className="quick-action-row">
                  <div className="quick-action-icon" style={{ background: `color-mix(in srgb, ${color} 10%, transparent)`, color }}>
                    <Icon size={15} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{label}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{sub}</p>
                  </div>
                  <LuChevronRight size={13} color="var(--text-muted)" />
                </Link>
              ))}
            </div>
          </div>

          {/* Upgrade card */}
          {(user?.merchant_tier === "free" || !user?.merchant_tier) && (
            <div className="bento-upgrade">
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <LuStar size={13} fill="white" color="white" />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.75 }}>Starter Plan</span>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, lineHeight: 1.25, color: "white" }}>
                Unlock the full<br />Koraa experience
              </h3>
              <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 20, lineHeight: 1.55, color: "white" }}>
                5 stores · 200+ products · Advanced analytics · Custom domains
              </p>
              <Link href="/dashboard/billing" style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: "white", color: "var(--brand-700)", fontWeight: 700, fontSize: 13,
                padding: "10px 0", borderRadius: 10, textDecoration: "none",
              }}>
                <LuZap size={14} /> Upgrade to Starter
              </Link>
            </div>
          )}

          {user?.merchant_tier === "starter" && (
            <div className="bento-upgrade">
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <LuStar size={13} fill="white" color="white" />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.75 }}>Pro Plan</span>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, lineHeight: 1.25, color: "white" }}>Scale your<br />business</h3>
              <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 20, lineHeight: 1.55, color: "white" }}>
                Unlimited stores · Unlimited products · Premium tools
              </p>
              <Link href="/dashboard/billing" style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: "white", color: "var(--brand-700)", fontWeight: 700, fontSize: 13,
                padding: "10px 0", borderRadius: 10, textDecoration: "none",
              }}>
                <LuZap size={14} /> Upgrade to Pro
              </Link>
            </div>
          )}
        </div>
      </div>

      <style>{`
        /* ── Shell ── */
        .overview-shell {
          padding: 28px 32px;
          max-width: 1280px;
          margin: 0 auto;
        }

        /* ── Welcome header ── */
        .overview-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 24px;
        }
        .overview-avatar {
          width: 46px;
          height: 46px;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--brand-600), var(--brand-400));
          color: white;
          font-weight: 800;
          font-size: 17px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-family: Outfit, sans-serif;
          letter-spacing: -0.02em;
        }
        .overview-greeting {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 2px;
        }
        .overview-name {
          font-size: 22px;
          font-weight: 800;
          font-family: Outfit, sans-serif;
          letter-spacing: -0.025em;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .overview-live-badge {
          font-size: 11px;
          font-weight: 700;
          color: #22c55e;
          background: rgba(34,197,94,0.1);
          padding: 3px 9px;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-family: inherit;
          letter-spacing: 0;
        }
        .overview-header-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        /* ── Stat strip ── */
        .stat-strip {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: var(--border);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 20px;
        }
        .stat-cell {
          background: var(--surface-900);
          padding: 18px 20px;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .stat-cell-icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .stat-cell-value {
          font-size: 22px;
          font-weight: 800;
          font-family: Outfit, sans-serif;
          color: var(--text-primary);
          letter-spacing: -0.02em;
          line-height: 1;
          margin-bottom: 2px;
        }
        .stat-cell-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .stat-cell-sub {
          font-size: 10px;
          color: var(--text-muted);
          margin-top: 1px;
        }

        /* ── Bento grid ── */
        .overview-bento {
          display: grid;
          grid-template-columns: 1fr 340px;
          grid-template-rows: auto auto;
          gap: 16px;
        }
        .bento-chart {
          grid-column: 1 / 2;
          background: var(--surface-900);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 22px 24px;
        }
        .bento-stores {
          grid-column: 1 / 2;
          background: var(--surface-900);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px;
        }
        .bento-actions {
          grid-column: 2 / 3;
          grid-row: 1 / 2;
          background: var(--surface-900);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px;
          align-self: start;
        }
        .bento-upgrade {
          grid-column: 2 / 3;
          grid-row: 2 / 3;
          background: linear-gradient(135deg, var(--brand-700), var(--brand-500));
          border-radius: 14px;
          padding: 22px;
          align-self: start;
        }

        /* ── Store card ── */
        .store-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--surface);
          transition: border-color .15s;
        }
        .store-card:hover {
          border-color: color-mix(in srgb, var(--brand-500) 30%, transparent);
        }
        .store-card-logo {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          background: var(--surface-700);
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          overflow: hidden;
        }

        /* ── Quick action row ── */
        .quick-action-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          border-radius: 9px;
          text-decoration: none;
          transition: background .15s;
        }
        .quick-action-row:hover {
          background: var(--surface-700);
        }
        .quick-action-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        /* ── Responsive ── */
        @media (max-width: 1024px) {
          .stat-strip {
            grid-template-columns: repeat(2, 1fr);
          }
          .overview-bento {
            grid-template-columns: 1fr;
          }
          .bento-chart,
          .bento-stores,
          .bento-actions,
          .bento-upgrade {
            grid-column: 1 / 2;
            grid-row: auto;
          }
        }
        @media (max-width: 640px) {
          .overview-shell {
            padding: 16px;
          }
          .stat-strip {
            grid-template-columns: repeat(2, 1fr);
            border-radius: 10px;
          }
          .stat-cell {
            padding: 14px 14px;
            gap: 10px;
          }
          .stat-cell-value {
            font-size: 18px;
          }
          .overview-header-actions {
            display: none;
          }
          .overview-name {
            font-size: 18px;
          }
        }
      `}</style>
    </>
  );
}
