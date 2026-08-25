"use client";

import PageTitle from "@/components/PageTitle";
import { useAuthStore } from "@/stores/auth";
import { storeApi, merchantApi, analyticsApi, Store } from "@/lib/api";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  LuStore, LuPackage, LuShoppingCart, LuTrendingUp, LuArrowUpRight, LuPlus,
  LuGlobe, LuLoader, LuCircle, LuStar, LuChevronRight, LuActivity, LuZap,
} from "react-icons/lu";
import dynamic from "next/dynamic";

/**
 * The chart, and with it recharts, out of this page's initial JavaScript.
 *
 * `loading` reserves the same 260px the chart occupies so the panel does not
 * change height when the chunk lands — without it the "Recent stores" grid
 * below would jump once on every visit.
 *
 * `ssr: false` because the chart has nothing to render on the server: its data
 * comes from a client-side query, so a server pass would emit an empty SVG and
 * then hydrate over it.
 */
const RevenueChart = dynamic(() => import("@/components/dashboard/RevenueChart"), {
  ssr: false,
  loading: () => <div style={{ height: 260 }} />,
});

/**
 * The revenue line, read from the sales report rather than invented.
 *
 * This was seven hard-coded numbers labelled "(mock data)". A chart showing a
 * merchant somebody else's imaginary good week is worse than no chart, and now
 * that `apps/analytics` answers the question there is no reason to keep it.
 *
 * `revenue` is null for an account whose shops bill in different currencies —
 * the report refuses to add XAF to NGN. The panel says so and drops the chart,
 * rather than drawing a line through a total that cannot be spent.
 */
const CHART_DAYS = 7;

function chartLabel(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, { weekday: "short" });
}

function StatCard({ label, value, sub, icon: Icon, trend, color }: {
  label: string; value: string | number; sub?: string; icon: any; trend?: string; color: string;
}) {
  return (
    <div style={{
      background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: 0,
      padding: "24px", display: "flex", flexDirection: "column", gap: 12,
      transition: "box-shadow .2s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{
          width: 40, height: 40, borderRadius: 0,
          /* `color-mix`, not a `${color}18` hex suffix. The suffix only
             works on a literal hex, and every colour passed in here is
             now a token — `var(--brand-text)18` is invalid CSS, which
             the browser drops silently, so the tint just wasn't there. */
          background: `color-mix(in srgb, ${color} 9%, transparent)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={19} color={color} />
        </div>
        {trend && (
          <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600, background: "rgba(34,197,94,0.08)", padding: "3px 8px", borderRadius: 0, display: "flex", alignItems: "center", gap: 4 }}>
            <LuTrendingUp size={11} /> {trend}
          </span>
        )}
      </div>
      <div>
        <p style={{ fontSize: 28, fontWeight: 800, fontFamily: "Outfit, sans-serif", color: "var(--text-primary)", lineHeight: 1 }}>{value}</p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{label}</p>
        {sub && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{sub}</p>}
      </div>
    </div>
  );
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: "Draft",     color: "#64748b", bg: "rgba(100,116,139,0.1)" },
  preview:   { label: "Preview",   color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  published: { label: "Live",      color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  suspended: { label: "Suspended", color: "#f87171", bg: "rgba(248,113,113,0.1)" },
};

function StoreRow({ store }: { store: Store }) {
  const s = STATUS_CFG[store.status] ?? STATUS_CFG.draft;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", borderBottom: "1px solid var(--border)", transition: "background .15s" }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--surface)"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 0, flexShrink: 0,
        background: "var(--surface-700)",
        border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {store.logo
          ? <img src={store.logo} alt={store.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <LuGlobe size={17} color="var(--brand-500)" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{store.name}</p>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{store.slug}.koraa.africa</p>
      </div>
      <span style={{ padding: "3px 10px", borderRadius: 0, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}>
        {store.status === "published" && <LuCircle size={7} fill={s.color} stroke="none" />}
        {s.label}
      </span>
      <Link href={`/dashboard/stores/${store.id}`} style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 500, textDecoration: "none", flexShrink: 0 }}>
        Manage <LuChevronRight size={14} />
      </Link>
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
  // Every shop the account can reach, which is what the rest of this page
  // counts too. The analytics page is where one shop at a time lives.
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["analytics", "sales", "", CHART_DAYS],
    queryFn: () => analyticsApi.sales({ days: CHART_DAYS }).then(r => r.data),
  });

  // Numbers for the axis only. The strings stay authoritative — a decimal
  // parsed into a JavaScript number is a decimal that can be rounded.
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

  return (
    <>
      <PageTitle title="Dashboard — Koraa" />

      <div style={{ padding: "32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* ── Welcome header ── */}
        <div style={{
          background: "var(--surface-900)",
          border: "1px solid var(--border)",
          borderRadius: 0,
          padding: "32px 36px",
          marginBottom: 24,
          borderLeft: "4px solid var(--brand-600)",
        }}>
          <p style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 600, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {greeting}
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", marginBottom: 8, fontFamily: "Outfit, sans-serif", letterSpacing: "-0.02em" }}>
            Welcome back, {firstName}
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24, maxWidth: 500, lineHeight: 1.6 }}>
            {stores.length === 0
              ? "You haven't created a store yet. Set one up in under 2 minutes."
              : `You have ${stores.length} store${stores.length > 1 ? "s" : ""}, ${publishedCount} currently live.`}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {stores.length === 0 ? (
              <Link href="/dashboard/stores" className="btn btn-primary">
                <LuPlus size={15} /> Create your first store
              </Link>
            ) : (
              <>
                <Link href="/dashboard/stores" className="btn btn-primary">
                  <LuStore size={15} /> Manage stores
                </Link>
                <Link href="/dashboard/products" className="btn btn-secondary">
                  <LuPackage size={15} /> View products
                </Link>
              </>
            )}
          </div>
        </div>

        {/* ── Stats ── */}
        {/* Four cards, four hues, all of them semantic tokens now rather
            than a violet-and-blue set borrowed from a different product.
            Ochre and clay are the brand's own two accents; the other two
            are the app's --warning and --info, which are a gold and a
            teal precisely so they read as status beside an ochre brand
            instead of fighting it. Every one is a *-text token, so it
            stays legible on the card in both themes. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 1, marginBottom: 24, border: "1px solid var(--border)", outline: "1px solid var(--border)" }}>
          <StatCard label="Total Stores" value={storesLoading ? "…" : stores.length} sub={`${publishedCount} published`} icon={LuStore} color="var(--brand-text)" />
          <StatCard label="Products" value={statsLoading ? "…" : (statsData?.total_products ?? 0)} sub="Across all stores" icon={LuPackage} color="var(--clay-text)" />
          <StatCard label="Orders" value={statsLoading ? "…" : (statsData?.total_orders ?? 0)} sub="All time" icon={LuShoppingCart} color="var(--warning-text)" />
          {/* Currency from the sales report rather than a hard-coded "XAF": a
              merchant billing in NGN was being shown their own money under
              somebody else's symbol. Blank while it loads, and blank for an
              account whose shops bill differently — the figure is still theirs,
              the label just isn't one currency. */}
          <StatCard label="Revenue" value={statsLoading ? "…" : `${(statsData?.total_revenue ?? 0).toLocaleString()}${chartCurrency ? ` ${chartCurrency}` : ""}`} sub="This month" icon={LuTrendingUp} color="var(--info-text)" />
        </div>

        {/* ── Revenue Graph ── */}
        <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: 0, padding: "20px 24px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>Revenue Overview</h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {mixedCurrencies
                  ? "Your shops bill in different currencies"
                  : `Paid orders over the last ${CHART_DAYS} days${chartCurrency ? ` · ${chartCurrency}` : ""}`}
              </p>
            </div>
            <Link href="/dashboard/analytics" className="btn btn-secondary btn-sm">
              Full analytics <LuChevronRight size={14} />
            </Link>
          </div>
          {salesLoading ? (
            <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <LuLoader size={22} className="spin" color="var(--brand-500)" />
            </div>
          ) : mixedCurrencies ? (
            // No line, rather than a line through added-up currencies. The
            // analytics page shows each shop's revenue in its own money.
            <p style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 13, color: "var(--text-muted)", maxWidth: 460, margin: "0 auto", lineHeight: 1.6 }}>
              There is no single revenue figure to draw when your shops sell in different currencies.
              Open the analytics page to see each shop in its own.
            </p>
          ) : (
            <RevenueChart data={chartData} currency={chartCurrency} />
          )}
        </div>

        {/* ── Main content grid ── */}
        <div className="dash-main-grid">

          {/* Stores list */}
          <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: 0, overflow: "hidden" }}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>Your Stores</h2>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{stores.length} store{stores.length !== 1 ? "s" : ""}</p>
              </div>
              <Link href="/dashboard/stores" className="btn btn-secondary btn-sm">
                <LuPlus size={13} /> New store
              </Link>
            </div>

            {storesLoading ? (
              <div style={{ padding: "48px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <LuLoader size={24} className="spin" color="var(--brand-500)" />
              </div>
            ) : stores.length === 0 ? (
              <div style={{ padding: "56px 32px", textAlign: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: 0, background: "var(--surface-700)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <LuStore size={22} color="var(--brand-500)" />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No stores yet</h3>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>Create your first store to start selling across Africa.</p>
                <Link href="/dashboard/stores" className="btn btn-primary btn-sm">
                  <LuPlus size={13} /> Create store
                </Link>
              </div>
            ) : (
              stores.map(store => <StoreRow key={store.id} store={store} />)
            )}
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Quick actions */}
            <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: 0, padding: "20px" }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Quick Actions</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {[
                  { icon: LuPlus, label: "Create store", sub: "Launch a new storefront", href: "/dashboard/stores", color: "var(--brand-text)" },
                  { icon: LuPackage, label: "Add product", sub: "List items for sale", href: "/dashboard/products", color: "var(--clay-text)" },
                  { icon: LuActivity, label: "View analytics", sub: "Track your performance", href: "/dashboard/analytics", color: "var(--warning-text)" },
                ].map(({ icon: Icon, label, sub, href, color }) => (
                  <Link key={href} href={href} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 10px", borderRadius: 0, background: "transparent", textDecoration: "none", transition: "background .15s", border: "1px solid transparent" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}
                  >
                    {/* Same tokens and the same `color-mix` as the stat cards
                        above — and the same bug fixed: the hex-suffix form
                        left every one of these swatches blank. */}
                    <div style={{ width: 34, height: 34, borderRadius: 0, background: `color-mix(in srgb, ${color} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 16%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={16} color={color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 1 }}>{label}</p>
                      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{sub}</p>
                    </div>
                    <LuChevronRight size={14} color="var(--text-muted)" />
                  </Link>
                ))}
              </div>
            </div>

            {/* Upgrade card */}
            {(user?.merchant_tier === "free" || !user?.merchant_tier) && (
              <div style={{
                background: "var(--brand-600)",
                borderRadius: 0,
                padding: "24px",
                color: "white",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <LuStar size={14} fill="white" color="white" />
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.8 }}>Starter Plan</span>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6, lineHeight: 1.3 }}>Unlock the full<br />Koraa experience</h3>
                <p style={{ fontSize: 12, opacity: 0.75, marginBottom: 18, lineHeight: 1.5 }}>
                  Up to 5 stores, 200+ products, advanced analytics and custom domains.
                </p>
                <Link href="/dashboard/billing" style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: "var(--surface-900)", color: "var(--brand-700)", fontWeight: 700, fontSize: 13,
                  padding: "10px 0", borderRadius: 0, textDecoration: "none",
                }}>
                  <LuZap size={14} /> Upgrade to Starter
                </Link>
              </div>
            )}

            {user?.merchant_tier === "starter" && (
              <div style={{
                background: "var(--brand-600)",
                borderRadius: 0,
                padding: "24px",
                color: "white",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <LuStar size={14} fill="white" color="white" />
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.8 }}>Pro Plan</span>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6, lineHeight: 1.3 }}>Scale your<br />business</h3>
                <p style={{ fontSize: 12, opacity: 0.75, marginBottom: 18, lineHeight: 1.5 }}>
                  Unlimited stores, unlimited products, advanced analytics and premium tools.
                </p>
                <Link href="/dashboard/billing" style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: "var(--surface-900)", color: "var(--brand-700)", fontWeight: 700, fontSize: 13,
                  padding: "10px 0", borderRadius: 0, textDecoration: "none",
                }}>
                  <LuZap size={14} /> Upgrade to Pro
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
