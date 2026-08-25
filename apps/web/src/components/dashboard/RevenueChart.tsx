"use client";

import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

/**
 * The overview page's revenue line, in its own module so recharts is in its own
 * chunk.
 *
 * recharts is the single largest dependency the dashboard has, and this one
 * chart was the only thing on the overview page that used it — so every
 * merchant landing on /dashboard was downloading and parsing the whole charting
 * library before the page could become interactive, to draw a panel that is
 * below the stat cards and cannot render until the sales report comes back over
 * the network anyway.
 *
 * Loaded through `next/dynamic` at the call site instead, the fetch for this
 * chunk starts at hydration and overlaps the report's own round trip, so in
 * practice the line still appears as soon as its data does.
 *
 * The caller keeps the panel, the heading and the loading and mixed-currency
 * states: those are cheap markup that should not wait on a chunk. This module
 * is only ever mounted once there are numbers to draw.
 */
export default function RevenueChart({
  data,
  currency,
}: {
  data: Array<{ name: string; revenue: number }>;
  currency: string | null;
}) {
  return (
    <div style={{ height: 260, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--brand-600)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--brand-600)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--text-muted)" }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--text-muted)" }} tickFormatter={v => Number(v) >= 10000 ? `${Math.round(Number(v) / 1000)}k` : Number(v).toLocaleString()} width={70} />
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
          <Tooltip
            contentStyle={{ borderRadius: 0, border: "1px solid var(--border)", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", fontSize: 13 }}
            itemStyle={{ color: "var(--brand-600)", fontWeight: 600 }}
            formatter={(value: unknown) => [`${Number(value).toLocaleString()}${currency ? ` ${currency}` : ""}`, "Revenue"]}
          />
          <Area type="monotone" dataKey="revenue" stroke="var(--brand-600)" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
