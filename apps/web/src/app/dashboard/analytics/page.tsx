"use client";

/**
 * Traffic, engagement and sales.
 *
 * This page was a stub: a fake 800 ms spinner followed by "Not enough data
 * yet", shown whether or not the shop had any, because nothing measured a
 * storefront. `apps/analytics` is that measurement, and the three tabs here are
 * the three questions in the order a merchant asks them — how many people came,
 * what they did, and what it earned.
 *
 * Two honesty rules, both visible in the copy rather than only in the code:
 *
 * **Traffic and engagement are a floor.** They come from events a visitor's
 * browser can decline, and every visitor is counted once per day rather than
 * once per month. The captions say so where the number is.
 *
 * **Money is never added across currencies.** The backend returns null instead
 * of a total when the selected shops bill differently, and this page shows the
 * per-shop table in its place rather than one confident wrong number.
 */

import PageTitle from "@/components/PageTitle";
import dynamic from "next/dynamic";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LuArrowDownRight,
  LuArrowUpRight,
  LuChartNoAxesColumn,
  LuCircleAlert,
  LuLoader,
} from "react-icons/lu";
import { BAR_CHART_HEIGHT, CHART_HEIGHT } from "./_chartHeights";

import { analyticsApi } from "@/lib/api";
import type {
  AnalyticsStoreOption,
  EngagementReport,
  SalesReport,
  TrafficReport,
} from "@/lib/api";
import StoreBackLink from "@/components/StoreBackLink";

/**
 * The charts, and with them recharts, out of this page's initial JavaScript.
 *
 * Four wrappers over one module, so webpack emits one chunk and the browser
 * fetches it once however many tabs the merchant opens. Every stat card, table
 * and note on this page used to wait behind the whole charting library before it
 * could be interacted with; now the chunk is requested at hydration and races
 * the report's own network round trip, which the charts cannot draw without.
 *
 * `ssr: false` on all four: the reports are client-side queries, so a server
 * pass has nothing to plot and would only emit an empty frame to hydrate over.
 *
 * `loading` reserves each chart's real height from `_chartHeights` so the tables
 * and breakdowns underneath do not slide up and back down when the chunk lands.
 */
const TrafficChart = dynamic(() => import("./_charts").then(m => m.TrafficChart), {
  ssr: false,
  loading: () => <div style={{ height: CHART_HEIGHT }} />,
});
const EngagementChart = dynamic(() => import("./_charts").then(m => m.EngagementChart), {
  ssr: false,
  loading: () => <div style={{ height: CHART_HEIGHT }} />,
});
const RevenueChart = dynamic(() => import("./_charts").then(m => m.RevenueChart), {
  ssr: false,
  loading: () => <div style={{ height: CHART_HEIGHT }} />,
});
const OrdersChart = dynamic(() => import("./_charts").then(m => m.OrdersChart), {
  ssr: false,
  loading: () => <div style={{ height: BAR_CHART_HEIGHT }} />,
});

type Tab = "traffic" | "engagement" | "sales";

/** The user's own order: traffic, then engagement, then sales. */
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "traffic", label: "Traffic" },
  { key: "engagement", label: "Engagement" },
  { key: "sales", label: "Sales" },
];

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last 12 months" },
];

const DEVICE_LABELS: Record<string, string> = {
  desktop: "Desktop",
  mobile: "Mobile",
  tablet: "Tablet",
  unknown: "Not detected",
};

const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  pending: "Awaiting payment",
  failed: "Failed",
};

// ─── Formatting ───────────────────────────────────────────────────────────

function count(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString();
}

/**
 * Money for display.
 *
 * `null` means the backend refused to add two currencies together, so it is
 * shown as an em dash rather than a zero — the amount is unknown, not nothing.
 */
function money(amount: string | null | undefined, currency: string | null): string {
  if (amount === null || amount === undefined) return "—";
  return `${Number(amount).toLocaleString()}${currency ? ` ${currency}` : ""}`;
}

function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value}%`;
}

/** "22 Aug", for a chart axis where the year is the same all the way across. */
function shortDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * Change against the previous window of the same length.
 *
 * Null when there is nothing to compare against: "+100%" from a base of zero is
 * arithmetic, not information.
 */
function delta(now: number, before: number): { text: string; up: boolean } | null {
  if (!before) return null;
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return null;
  return { text: `${change > 0 ? "+" : ""}${change}%`, up: change > 0 };
}

// ─── Chrome ───────────────────────────────────────────────────────────────

function Spinner({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "40vh",
        gap: 16,
      }}
    >
      <LuLoader size={32} className="spin" color="var(--brand-500)" />
      <p style={{ color: "var(--text-secondary)", fontSize: 14, fontWeight: 500 }}>{label}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  change,
}: {
  label: string;
  value: string;
  sub?: string;
  change?: { text: string; up: boolean } | null;
}) {
  return (
    <div className="stat-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</p>
        {change && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              color: change.up ? "var(--success)" : "var(--danger)",
            }}
          >
            {change.up ? <LuArrowUpRight size={12} /> : <LuArrowDownRight size={12} />}
            {change.text}
          </span>
        )}
      </div>
      <p
        style={{
          fontSize: 26,
          fontWeight: 800,
          fontFamily: "Outfit, sans-serif",
          lineHeight: 1.1,
          marginTop: 8,
        }}
      >
        {value}
      </p>
      {sub && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        gap: 12,
        marginBottom: 20,
      }}
    >
      {children}
    </div>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="table-container" style={{ marginBottom: 20 }}>
      <header style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>{title}</h2>
        {note && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>{note}</p>}
      </header>
      {children}
    </section>
  );
}

/** The caveat that belongs beside a measured number, said once per tab. */
function MeasuredNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        fontSize: 12,
        color: "var(--text-muted)",
        background: "var(--surface-850)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "10px 14px",
        marginBottom: 20,
        lineHeight: 1.5,
      }}
    >
      <LuCircleAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </p>
  );
}

/** A two-column breakdown: a label, and how many. */
function Breakdown({
  rows,
  empty,
  head,
}: {
  rows: Array<{ key: string; label: string; value: string }>;
  empty: string;
  head: [string, string];
}) {
  if (rows.length === 0) {
    return <p style={{ padding: "28px 20px", fontSize: 13, color: "var(--text-muted)" }}>{empty}</p>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>{head[0]}</th>
            <th style={{ textAlign: "right" }}>{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key}>
              <td
                style={{
                  maxWidth: 360,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.label}
              </td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Nothing measured yet — said differently from "nothing sold yet". */
function NoData({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="table-container" style={{ textAlign: "center", padding: "72px 24px" }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "var(--radius-xl)",
          background: "rgba(168, 85, 247, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 20px",
        }}
      >
        <LuChartNoAxesColumn size={26} color="var(--brand-500)" />
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 460, margin: "0 auto", lineHeight: 1.6 }}>
        {body}
      </p>
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  // useSearchParams suspends, and this page is otherwise statically
  // prerenderable — same reason StoreBackLink wraps its own param read.
  return (
    <Suspense fallback={<Spinner label="Loading analytics…" />}>
      <AnalyticsView />
    </Suspense>
  );
}

function AnalyticsView() {
  // Arrived from a store's manage grid, which appends `?store=<id>`. Honouring
  // it is what makes "the traffic of that specific storefront" one click.
  const storeParam = useSearchParams().get("store");

  const [tab, setTab] = useState<Tab>("traffic");
  const [storeId, setStoreId] = useState<string>(storeParam ?? "");
  const [days, setDays] = useState(30);

  const params = { ...(storeId ? { store: storeId } : {}), days };

  // One query per tab, each fetching only while its tab is open. Going back to
  // a tab you have already seen is then instant rather than a second wait.
  const traffic = useQuery({
    queryKey: ["analytics", "traffic", storeId, days],
    queryFn: () => analyticsApi.traffic(params).then(res => res.data),
    enabled: tab === "traffic",
  });
  const engagement = useQuery({
    queryKey: ["analytics", "engagement", storeId, days],
    queryFn: () => analyticsApi.engagement(params).then(res => res.data),
    enabled: tab === "engagement",
  });
  const sales = useQuery({
    queryKey: ["analytics", "sales", storeId, days],
    queryFn: () => analyticsApi.sales(params).then(res => res.data),
    enabled: tab === "sales",
  });

  const active = tab === "traffic" ? traffic : tab === "engagement" ? engagement : sales;

  // Dispatched by tab rather than called on `active`, whose type is the union of
  // three differently-shaped results.
  const retry = () => {
    if (tab === "traffic") void traffic.refetch();
    else if (tab === "engagement") void engagement.refetch();
    else void sales.refetch();
  };

  // Whichever tab answered most recently knows the shop list. Kept across tab
  // switches so the picker does not blink out mid-load.
  const options: AnalyticsStoreOption[] =
    traffic.data?.available_stores ??
    engagement.data?.available_stores ??
    sales.data?.available_stores ??
    [];

  const tabStyle = (key: Tab): React.CSSProperties => ({
    padding: "10px 2px",
    fontSize: 14,
    fontWeight: 600,
    background: "none",
    border: "none",
    borderBottom: tab === key ? "2px solid var(--brand-500)" : "2px solid transparent",
    color: tab === key ? "var(--brand-500)" : "var(--text-secondary)",
    cursor: "pointer",
  });

  return (
    <>
      <PageTitle title="Analytics — Koraa" />

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <StoreBackLink />

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.02em" }}>
              Analytics
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
              How people find your shops, what they do there, and what it earns.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {options.length > 1 && (
              <select
                className="input"
                value={storeId}
                onChange={e => setStoreId(e.target.value)}
                style={{ minWidth: 180, fontWeight: 500 }}
              >
                <option value="">All stores</option>
                {options.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <select
              className="input"
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              style={{ minWidth: 150, fontWeight: 500 }}
            >
              {RANGES.map(r => (
                <option key={r.days} value={r.days}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <nav
          style={{
            display: "flex",
            gap: 24,
            borderBottom: "1px solid var(--border)",
            marginBottom: 24,
          }}
        >
          {TABS.map(t => (
            <button key={t.key} style={tabStyle(t.key)} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>

        {active.isPending ? (
          <Spinner label="Loading analytics…" />
        ) : active.isError ? (
          <NoData
            title="Could not load this report"
            body={
              storeId
                ? "The request came back with an error. This usually means the shop in the link no longer exists, or is no longer yours to open."
                : "The request did not come back. Check your connection and try again — nothing has been lost."
            }
            action={
              // The store picker is built from a report that answered, so a bad
              // `?store=` in the link leaves it hidden — and the merchant with no
              // way back to the shops they can see. This is that way back.
              storeId ? (
                <button className="btn btn-secondary btn-sm" onClick={() => setStoreId("")}>
                  Show all my shops
                </button>
              ) : (
                <button className="btn btn-secondary btn-sm" onClick={retry}>
                  Try again
                </button>
              )
            }
          />
        ) : tab === "traffic" ? (
          <TrafficTab data={traffic.data as TrafficReport} multi={options.length > 1} />
        ) : tab === "engagement" ? (
          <EngagementTab data={engagement.data as EngagementReport} multi={options.length > 1} />
        ) : (
          <SalesTab data={sales.data as SalesReport} multi={options.length > 1} />
        )}
      </div>
    </>
  );
}

// ─── Traffic ──────────────────────────────────────────────────────────────

function TrafficTab({ data, multi }: { data: TrafficReport; multi: boolean }) {
  if (data.totals.views === 0) {
    return (
      <NoData
        title="No visits measured yet"
        body="Traffic appears here once someone opens a published storefront. If your shop is live and you have just published it, share the link and check back — the first visit is usually the merchant's own."
      />
    );
  }

  const chart = data.series.map(row => ({ ...row, label: shortDate(row.date) }));

  return (
    <>
      <StatRow>
        <Stat
          label="Page views"
          value={count(data.totals.views)}
          change={delta(data.totals.views, data.previous.views)}
          sub={`${count(data.previous.views)} in the ${data.range.days} days before`}
        />
        <Stat
          label="Visitors"
          value={count(data.totals.visitors)}
          change={delta(data.totals.visitors, data.previous.visitors)}
          sub="Counted once per day"
        />
        <Stat
          label="Pages per visit"
          value={data.totals.views_per_visitor.toFixed(2)}
          sub="Views divided by visitors"
        />
        <Stat
          label="Single-page visits"
          value={pct(data.totals.bounce_rate)}
          sub="Arrived, read one page, left"
        />
      </StatRow>

      <MeasuredNote>
        These are measured, not absolute. A visitor is identified by a hash that changes at midnight,
        so somebody who came on three days counts as three visitors — and a visitor who declined your
        cookie banner, or whose browser blocks the request, is not counted at all. Order and revenue
        figures on the Sales tab do not depend on any of this.
      </MeasuredNote>

      <Panel title="Views and visitors" note={`${shortDate(data.range.start)} — ${shortDate(data.range.end)}`}>
        <TrafficChart data={chart} />
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
        <Panel title="Most-visited pages">
          <Breakdown
            head={["Page", "Views"]}
            empty="No pages recorded."
            rows={data.top_pages.map(row => ({
              key: row.path,
              label: row.path,
              value: count(row.views),
            }))}
          />
        </Panel>

        <Panel title="Where visitors came from" note="“Direct” is a typed address, a bookmark, or an app that hides the source.">
          <Breakdown
            head={["Source", "Views"]}
            empty="No sources recorded."
            rows={data.referrers.map(row => ({
              key: row.source,
              label: row.source,
              value: count(row.views),
            }))}
          />
        </Panel>

        <Panel title="Devices">
          <Breakdown
            head={["Device", "Views"]}
            empty="No devices recorded."
            rows={data.devices.map(row => ({
              key: row.device,
              label: DEVICE_LABELS[row.device] ?? row.device,
              value: count(row.views),
            }))}
          />
        </Panel>
      </div>

      {multi && (
        <Panel title="By shop" note="Every shop you can reach, including the quiet ones.">
          <Breakdown
            head={["Shop", "Views"]}
            empty="No shops."
            rows={data.stores.map(row => ({
              key: row.id,
              label: row.name,
              value: count(row.views),
            }))}
          />
        </Panel>
      )}
    </>
  );
}

// ─── Engagement ───────────────────────────────────────────────────────────

function EngagementTab({ data, multi }: { data: EngagementReport; multi: boolean }) {
  const t = data.totals;
  const nothing =
    t.product_views === 0 &&
    t.add_to_cart === 0 &&
    t.checkout_started === 0 &&
    t.enquiries === 0 &&
    t.orders_paid === 0;

  if (nothing) {
    return (
      <NoData
        title="Nothing to report yet"
        body="This tab fills in once visitors start opening products, adding to their carts, or sending you enquiries. Traffic comes first — check that tab to see whether anyone has arrived."
      />
    );
  }

  const chart = data.series.map(row => ({ ...row, label: shortDate(row.date) }));
  const widest = Math.max(...data.funnel.map(step => step.count), 1);

  return (
    <>
      <StatRow>
        <Stat label="Products opened" value={count(t.product_views)} sub="A visitor opening one product" />
        <Stat label="Added to cart" value={count(t.add_to_cart)} />
        <Stat label="Reached checkout" value={count(t.checkout_started)} />
        <Stat label="Enquiries" value={count(t.enquiries)} sub="From your contact form" />
      </StatRow>

      <MeasuredNote>
        Everything except enquiries and paid orders is measured from the storefront, so a visitor who
        declined your cookie banner is missing from it. Enquiries and paid orders are counted exactly,
        which is why the last step of the funnel below carries no percentage — it is not comparable
        with the sampled steps above it.
      </MeasuredNote>

      <Panel title="From opening a product to paying">
        <div style={{ padding: "8px 20px 20px" }}>
          {data.funnel.map(step => (
            <div key={step.step} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{step.step}</span>
                <span style={{ fontSize: 13, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {count(step.count)}
                  {step.rate !== null && (
                    <span style={{ color: "var(--text-muted)" }}> · {step.rate}% of the step above</span>
                  )}
                </span>
              </div>
              <div style={{ height: 8, background: "var(--surface-850)", borderRadius: 999 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.max((step.count / widest) * 100, step.count > 0 ? 2 : 0)}%`,
                    background: "var(--brand-500)",
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
          ))}
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 14, lineHeight: 1.5 }}>
            “Paid” is read from your order book rather than from the storefront, so it can look better
            than the step above it — a shopper whose browser sent nothing still paid.
          </p>
        </div>
      </Panel>

      <Panel title="Activity over time">
        <EngagementChart data={chart} />
      </Panel>

      <Panel
        title="Products that got attention"
        note="Opens and add-to-carts side by side: many opens and no carts is a different problem from neither."
      >
        {data.top_products.length === 0 ? (
          <p style={{ padding: "28px 20px", fontSize: 13, color: "var(--text-muted)" }}>
            No product activity in this range.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ textAlign: "right" }}>Opened</th>
                  <th style={{ textAlign: "right" }}>Added to cart</th>
                  <th style={{ textAlign: "right" }}>Cart rate</th>
                </tr>
              </thead>
              <tbody>
                {data.top_products.map(row => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{count(row.views)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{count(row.carted)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {row.views ? `${row.cart_rate}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Only when there is something in it. A permanent "Searches: 0" panel
          would read as a broken shop rather than as an unused feature. */}
      {data.searches.length > 0 && (
        <Panel title="What visitors searched for">
          <Breakdown
            head={["Term", "Searches"]}
            empty="No searches."
            rows={data.searches.map(row => ({
              key: row.term,
              label: row.term,
              value: count(row.count),
            }))}
          />
        </Panel>
      )}

      {multi && (
        <Panel title="By shop">
          <Breakdown
            head={["Shop", "Events"]}
            empty="No shops."
            rows={data.stores.map(row => ({
              key: row.id,
              label: row.name,
              value: count(row.events),
            }))}
          />
        </Panel>
      )}
    </>
  );
}

// ─── Sales ────────────────────────────────────────────────────────────────

function SalesTab({ data, multi }: { data: SalesReport; multi: boolean }) {
  if (data.totals.orders_all === 0) {
    return (
      <NoData
        title="No orders yet"
        body="Sales here are read straight from your order book, so this fills in the moment somebody buys — whether or not they agreed to be measured."
      />
    );
  }

  const mixed = data.currency === null;
  // Numbers for the axis only. The strings stay authoritative; a decimal parsed
  // into a JavaScript number is a decimal that can be rounded.
  const chart = data.series.map(row => ({
    label: shortDate(row.date),
    orders: row.orders,
    revenue: Number(row.revenue ?? 0),
  }));

  return (
    <>
      <StatRow>
        <Stat
          label="Revenue"
          value={money(data.totals.revenue, data.currency)}
          change={
            data.totals.revenue && data.previous.revenue
              ? delta(Number(data.totals.revenue), Number(data.previous.revenue))
              : null
          }
          sub="Paid orders only"
        />
        <Stat
          label="Paid orders"
          value={count(data.totals.orders)}
          change={delta(data.totals.orders, data.previous.orders)}
          sub={`${count(data.totals.orders_all)} placed in total`}
        />
        <Stat label="Average order" value={money(data.totals.average_order, data.currency)} />
        <Stat label="Items sold" value={count(data.totals.units)} />
        <Stat
          label="Visit to order"
          value={pct(data.totals.conversion_rate)}
          sub={data.totals.conversion_rate === null ? "No measured traffic yet" : "Paid orders per visitor"}
        />
      </StatRow>

      {mixed ? (
        <MeasuredNote>
          The shops you have selected bill in different currencies, so there is no single revenue
          total to show — adding one currency to another would give a number you could not spend.
          Order and item counts still add up, and the per-shop table below shows each amount in its
          own currency.
        </MeasuredNote>
      ) : (
        <MeasuredNote>
          Revenue counts paid orders only. Orders awaiting payment appear under payment status below,
          where they read as what they are. The visit-to-order rate is the one figure here that leans
          on measured traffic, so treat it as a floor.
        </MeasuredNote>
      )}

      {!mixed && (
        <Panel title="Revenue" note={`${shortDate(data.range.start)} — ${shortDate(data.range.end)}`}>
          <RevenueChart data={chart} currency={data.currency} />
        </Panel>
      )}

      <Panel title="Paid orders per day">
        <OrdersChart data={chart} />
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        <Panel title="By payment status">
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Orders</th>
                  <th style={{ textAlign: "right" }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {data.by_status.map(row => (
                  <tr key={row.status}>
                    <td>{STATUS_LABELS[row.status] ?? row.status}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{count(row.orders)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {money(row.revenue, data.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Best sellers" note="Named as they were sold, so a product you have since deleted still appears.">
          {data.top_products.length === 0 ? (
            <p style={{ padding: "28px 20px", fontSize: 13, color: "var(--text-muted)" }}>
              No paid orders in this range.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{ textAlign: "right" }}>Units</th>
                    <th style={{ textAlign: "right" }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_products.map(row => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{count(row.units)}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {money(row.revenue, data.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {multi && (
        <Panel title="By shop" note="Each in its own currency.">
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Shop</th>
                  <th style={{ textAlign: "right" }}>Paid orders</th>
                  <th style={{ textAlign: "right" }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.stores.map(row => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{count(row.orders)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {money(row.revenue, row.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
