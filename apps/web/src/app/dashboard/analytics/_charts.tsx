"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

import { BAR_CHART_HEIGHT, CHART_HEIGHT } from "./_chartHeights";

/**
 * Every recharts-touching part of the analytics page, in one module so the
 * library lands in one chunk that is fetched once.
 *
 * The page itself is stat cards, tables, notes and copy — all of it cheap, and
 * all of it previously waiting behind recharts, the largest dependency in the
 * dashboard, before it could become interactive. Nothing here can draw anything
 * until a report comes back over the network, so the page loses nothing by
 * fetching this chunk in parallel with that request instead of ahead of it.
 *
 * The four exports are deliberately dumb: they take the already-shaped series
 * their tab computed and hold no queries or state of their own. The page keeps
 * every loading, empty and mixed-currency branch, so a merchant with nothing
 * measured yet never pays for this chunk at all.
 *
 * `ChartFrame`, `AXIS`, `TOOLTIP` and `tickInterval` moved here with them —
 * they were shared by these four callers and nothing else.
 */

/** Enough ticks to read, whatever the range. */
function tickInterval(points: number): number {
  return Math.max(0, Math.ceil(points / 8) - 1);
}

function ChartFrame({ children, height = CHART_HEIGHT }: { children: React.ReactElement; height?: number }) {
  return (
    <div style={{ height, padding: "18px 12px 6px 0" }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

const AXIS = {
  axisLine: false as const,
  tickLine: false as const,
  tick: { fontSize: 12, fill: "var(--text-muted)" },
};

const TOOLTIP = {
  contentStyle: {
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)",
    background: "var(--surface-900)",
    boxShadow: "var(--shadow-sm)",
    fontSize: 13,
  },
  labelStyle: { color: "var(--text-secondary)", marginBottom: 4 },
};

/** Views against visitors. The dashed line is visitors: fewer, and unfilled. */
export function TrafficChart({
  data,
}: {
  data: Array<{ label: string; views: number; visitors: number }>;
}) {
  return (
    <ChartFrame>
      <AreaChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="anViews" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--brand-600)" stopOpacity={0.32} />
            <stop offset="95%" stopColor="var(--brand-600)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" {...AXIS} dy={8} interval={tickInterval(data.length)} />
        <YAxis {...AXIS} width={48} allowDecimals={false} />
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
        <Tooltip {...TOOLTIP} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Area
          type="monotone"
          dataKey="views"
          name="Page views"
          stroke="var(--brand-600)"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#anViews)"
        />
        <Area
          type="monotone"
          dataKey="visitors"
          name="Visitors"
          stroke="var(--text-secondary)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          fill="none"
        />
      </AreaChart>
    </ChartFrame>
  );
}

/** The three funnel steps over time, all unfilled so none hides another. */
export function EngagementChart({
  data,
}: {
  data: Array<{
    label: string;
    product_views: number;
    add_to_cart: number;
    checkout_start: number;
  }>;
}) {
  return (
    <ChartFrame>
      <AreaChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <XAxis dataKey="label" {...AXIS} dy={8} interval={tickInterval(data.length)} />
        <YAxis {...AXIS} width={48} allowDecimals={false} />
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
        <Tooltip {...TOOLTIP} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Area
          type="monotone"
          dataKey="product_views"
          name="Products opened"
          stroke="var(--brand-600)"
          strokeWidth={2}
          fill="none"
        />
        <Area
          type="monotone"
          dataKey="add_to_cart"
          name="Added to cart"
          stroke="var(--success)"
          strokeWidth={2}
          fill="none"
        />
        <Area
          type="monotone"
          dataKey="checkout_start"
          name="Reached checkout"
          stroke="var(--warning)"
          strokeWidth={2}
          fill="none"
        />
      </AreaChart>
    </ChartFrame>
  );
}

/**
 * Revenue over time.
 *
 * `currency` is only ever a single currency: the page does not mount this at
 * all when the selected shops bill differently, because the series it would be
 * drawing added two currencies together.
 */
export function RevenueChart({
  data,
  currency,
}: {
  data: Array<{ label: string; revenue: number }>;
  currency: string | null;
}) {
  return (
    <ChartFrame>
      <AreaChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="anRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--brand-600)" stopOpacity={0.32} />
            <stop offset="95%" stopColor="var(--brand-600)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" {...AXIS} dy={8} interval={tickInterval(data.length)} />
        <YAxis {...AXIS} width={72} tickFormatter={v => Number(v).toLocaleString()} />
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
        <Tooltip
          {...TOOLTIP}
          formatter={(value: unknown) =>
            `${Number(value).toLocaleString()} ${currency ?? ""}`.trim()
          }
        />
        <Area
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke="var(--brand-600)"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#anRevenue)"
        />
      </AreaChart>
    </ChartFrame>
  );
}

/** Paid orders per day. Bars rather than a line: these are counts, not a rate. */
export function OrdersChart({
  data,
}: {
  data: Array<{ label: string; orders: number }>;
}) {
  return (
    <ChartFrame height={BAR_CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <XAxis dataKey="label" {...AXIS} dy={8} interval={tickInterval(data.length)} />
        <YAxis {...AXIS} width={40} allowDecimals={false} />
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
        <Tooltip {...TOOLTIP} />
        <Bar dataKey="orders" name="Paid orders" fill="var(--brand-500)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartFrame>
  );
}
