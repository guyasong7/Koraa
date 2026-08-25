"use client";

/**
 * The merchant's order book.
 *
 * This page was a stub: a fake 800ms spinner followed by "No orders yet",
 * shown whether or not the shop had sold anything, because there was no
 * merchant order endpoint to call. `GET /orders/` is that endpoint, and it
 * spans every shop the merchant can reach with `store` as a filter — one
 * order book rather than one per shop.
 *
 * Filtering, searching and ordering are done by the server rather than in the
 * browser, so the CSV export can reuse the exact same query: the file the
 * merchant downloads is the table they are looking at, not "everything ever".
 */

import PageTitle from "@/components/PageTitle";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuDownload,
  LuLoader,
  LuMail,
  LuSearch,
  LuShoppingCart,
} from "react-icons/lu";
import toast from "react-hot-toast";

import { orderApi, storeApi } from "@/lib/api";
import type { MerchantOrder, OrderListParams } from "@/lib/api";
import StoreBackLink from "@/components/StoreBackLink";

const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  pending: "Awaiting payment",
  failed: "Failed",
};

const STATUS_BADGE: Record<string, string> = {
  paid: "badge-success",
  pending: "badge-warning",
  failed: "badge-danger",
};

function money(amount: string | undefined, currency: string): string {
  const value = Number(amount ?? 0);
  return `${value.toLocaleString()} ${currency}`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function OrdersPage() {
  // useSearchParams suspends, and this page is otherwise statically
  // prerenderable — same reason StoreBackLink wraps its own param read.
  return (
    <Suspense fallback={<Spinner label="Loading orders…" />}>
      <OrdersView />
    </Suspense>
  );
}

function OrdersView() {
  const storeParam = useSearchParams().get("store");

  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const [storeId, setStoreId] = useState<string>(storeParam ?? "");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  // Separate from `search` so typing does not fire a request per keystroke.
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Any change of filter invalidates the page number: page 4 of a narrower
  // result set is usually empty, which reads as "no orders".
  useEffect(() => {
    setPage(1);
  }, [storeId, statusFilter, query]);

  const params = useCallback((): OrderListParams => {
    const p: OrderListParams = {};
    if (storeId) p.store = storeId;
    if (statusFilter) p.payment_status = statusFilter;
    if (query) p.search = query;
    return p;
  }, [storeId, statusFilter, query]);

  useEffect(() => {
    storeApi
      .list()
      .then(res => setStores(res.data?.results ?? res.data ?? []))
      .catch(() => {
        /* The order list is still usable without the store filter. */
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    orderApi
      .list({ ...params(), page })
      .then(res => {
        if (cancelled) return;
        setOrders(res.data.results ?? []);
        setCount(res.data.count ?? 0);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load your orders.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params, page]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await orderApi.exportCsv(params());
      // Content-Disposition is only readable cross-origin when the server
      // exposes it, so the filename is rebuilt here rather than parsed.
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `koraa-orders-${stamp}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded.");
    } catch {
      toast.error("Could not export your orders.");
    } finally {
      setIsExporting(false);
    }
  };

  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const isFiltered = Boolean(storeId || statusFilter || query);

  return (
    <>
      <PageTitle title="Orders — Koraa" />

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <StoreBackLink />

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 32,
          }}
        >
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.02em" }}>
              Orders
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
              {count > 0
                ? `${count.toLocaleString()} order${count === 1 ? "" : "s"}${isFiltered ? " matching your filters" : ""}.`
                : "Track, manage and fulfill customer purchases."}
            </p>
          </div>

          <button
            className="btn btn-secondary"
            onClick={handleExport}
            disabled={isExporting || count === 0}
            title={isFiltered ? "Exports the filtered list" : "Exports every order"}
          >
            {isExporting ? <LuLoader size={16} className="spin" /> : <LuDownload size={16} />}
            Export CSV
          </button>
        </div>

        <div className="table-container">
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              background: "var(--surface-900)",
            }}
          >
            <div style={{ position: "relative", flex: "1 1 220px", maxWidth: "100%" }}>
              <LuSearch
                size={16}
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                }}
              />
              <input
                type="text"
                className="input"
                placeholder="Search by customer, email or city…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: "100%", paddingLeft: 38, background: "var(--surface)", border: "none" }}
              />
            </div>

            {stores.length > 1 && (
              <select
                className="input"
                value={storeId}
                onChange={e => setStoreId(e.target.value)}
                style={{ background: "var(--surface)", border: "none", minWidth: 170, fontWeight: 500 }}
              >
                <option value="">All stores</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            <select
              className="input"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ background: "var(--surface)", border: "none", minWidth: 170, fontWeight: 500 }}
            >
              <option value="">Any status</option>
              <option value="paid">Paid</option>
              <option value="pending">Awaiting payment</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {isLoading ? (
            <Spinner label="Loading orders…" />
          ) : orders.length === 0 ? (
            <EmptyState isFiltered={isFiltered} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 24 }}>Order</th>
                  <th>Customer</th>
                  {stores.length > 1 && !storeId && <th>Store</th>}
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th style={{ width: 56 }}></th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    showStore={stores.length > 1 && !storeId}
                  />
                ))}
              </tbody>
            </table>
          )}

          {pages > 1 && (
            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Page {page} of {pages}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: "6px 12px" }}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <LuChevronLeft size={15} /> Previous
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: "6px 12px" }}
                  onClick={() => setPage(p => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                >
                  Next <LuChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * One order, expandable.
 *
 * The list serializer deliberately omits line items and the delivery address —
 * twenty orders of five lines each is a lot of payload for a table that shows
 * neither — so opening a row fetches the detail once and keeps it.
 */
function OrderRow({ order, showStore }: { order: MerchantOrder; showStore: boolean }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<MerchantOrder | null>(null);
  const [isSending, setIsSending] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      orderApi
        .get(order.id)
        .then(res => setDetail(res.data))
        .catch(() => toast.error("Could not open that order."));
    }
  };

  const resend = async () => {
    setIsSending(true);
    try {
      const res = await orderApi.resendInvoice(order.id);
      toast.success(`Invoice sent to ${res.data.to}`);
    } catch {
      toast.error("Could not send the invoice.");
    } finally {
      setIsSending(false);
    }
  };

  const columns = showStore ? 7 : 6;

  return (
    <>
      <tr style={{ cursor: "pointer" }} onClick={toggle}>
        <td style={{ paddingLeft: 24 }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, fontVariantNumeric: "tabular-nums" }}>
            #{order.reference}
          </p>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{when(order.created_at)}</p>
        </td>
        <td>
          <p style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{order.customer_name}</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{order.customer_email}</p>
        </td>
        {showStore && (
          <td style={{ fontSize: 14, color: "var(--text-secondary)" }}>{order.store_name}</td>
        )}
        <td style={{ fontSize: 14 }}>{order.item_count ?? 0}</td>
        <td style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {money(order.total_amount, order.currency)}
        </td>
        <td>
          <span className={`badge ${STATUS_BADGE[order.payment_status] ?? "badge-neutral"}`}>
            {STATUS_LABELS[order.payment_status] ?? order.payment_status}
          </span>
        </td>
        <td style={{ paddingRight: 24, textAlign: "right", color: "var(--text-muted)" }}>
          <LuChevronDown
            size={16}
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}
          />
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={columns} style={{ padding: 0, background: "var(--surface-850)" }}>
            {!detail ? (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                <LuLoader size={18} className="spin" />
              </div>
            ) : (
              <div
                style={{
                  padding: "22px 24px",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 32,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                  <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-muted)", marginBottom: 12 }}>
                    Items
                  </h4>
                  {(detail.items ?? []).map(item => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 16,
                        padding: "7px 0",
                        borderBottom: "1px solid var(--border)",
                        fontSize: 14,
                      }}
                    >
                      <span>
                        <strong style={{ fontWeight: 600 }}>{item.quantity}×</strong> {item.product_name}
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {money(item.line_total, detail.currency)}
                      </span>
                    </div>
                  ))}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      paddingTop: 10,
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  >
                    <span>Total</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {money(detail.total_amount, detail.currency)}
                    </span>
                  </div>
                </div>

                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-muted)", marginBottom: 12 }}>
                    Deliver to
                  </h4>
                  <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-line", color: "var(--text-secondary)" }}>
                    {detail.customer_name}
                    {"\n"}
                    {detail.shipping_address}
                    {"\n"}
                    {detail.city}
                    {detail.postal_code ? `, ${detail.postal_code}` : ""}
                    {detail.customer_phone ? `\n${detail.customer_phone}` : ""}
                  </p>
                </div>

                <div style={{ flex: "0 1 200px" }}>
                  <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-muted)", marginBottom: 12 }}>
                    Invoice
                  </h4>
                  <button
                    className="btn btn-secondary"
                    onClick={resend}
                    disabled={isSending || !detail.customer_email}
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    {isSending ? <LuLoader size={15} className="spin" /> : <LuMail size={15} />}
                    Resend invoice
                  </button>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
                    Emails {detail.customer_email || "the customer"} a copy carrying your store logo.
                  </p>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

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

function EmptyState({ isFiltered }: { isFiltered: boolean }) {
  return (
    <div style={{ textAlign: "center", padding: "72px 20px" }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "var(--radius-xl)",
          background: "rgba(168, 85, 247, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
        }}
      >
        <LuShoppingCart size={32} color="var(--brand-500)" />
      </div>
      <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
        {isFiltered ? "No orders match those filters" : "No orders yet"}
      </h3>
      <p style={{ color: "var(--text-secondary)", maxWidth: 420, margin: "0 auto" }}>
        {isFiltered
          ? "Try a different store, status or search term."
          : "When customers place orders they appear here, and every paid order emails the buyer an invoice automatically."}
      </p>
    </div>
  );
}
