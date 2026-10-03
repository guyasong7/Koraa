"use client";

import PageTitle from "@/components/PageTitle";
import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { storeApi, type DiscountCode, type DiscountCodeCreate, type DiscountType } from "@/lib/api";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  Add01Icon,
  Delete02Icon,
  Loading03Icon,
  Discount01Icon,
  Cancel01Icon,
  Tick02Icon,
  Edit02Icon,
} from "@hugeicons/core-free-icons";

function when(iso: string): string {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / 1440)} d ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const EMPTY_FORM: DiscountCodeCreate = {
  code: "",
  discount_type: "percentage",
  discount_value: 0,
  min_order_amount: null,
  max_uses: null,
  is_active: true,
  valid_from: null,
  valid_until: null,
};

export default function DiscountsPage() {
  const id = useParams().id as string;
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DiscountCodeCreate>({ ...EMPTY_FORM });

  const { data: store } = useQuery({
    queryKey: ["store", id],
    queryFn: () => storeApi.get(id).then((r) => r.data),
    enabled: !!id,
  });

  const { data: discounts, isLoading } = useQuery<DiscountCode[]>({
    queryKey: ["discounts", id],
    queryFn: () => storeApi.listDiscounts(id).then((r) => r.data?.results ?? r.data),
    enabled: !!id,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["discounts", id] });

  const createMutation = useMutation({
    mutationFn: (data: DiscountCodeCreate) => storeApi.createDiscount(id, data),
    onSuccess: () => {
      toast.success("Discount code created.");
      resetForm();
      refresh();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || err?.response?.data?.code?.[0] || "Could not create discount code.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ discountId, data }: { discountId: string; data: Partial<DiscountCodeCreate> }) =>
      storeApi.updateDiscount(id, discountId, data),
    onSuccess: () => {
      toast.success("Discount code updated.");
      resetForm();
      refresh();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Could not update discount code.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (discountId: string) => storeApi.deleteDiscount(id, discountId),
    onSuccess: () => {
      toast.success("Discount code deleted.");
      refresh();
    },
    onError: () => toast.error("Could not delete that discount code."),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ discountId, is_active }: { discountId: string; is_active: boolean }) =>
      storeApi.updateDiscount(id, discountId, { is_active }),
    onSuccess: refresh,
    onError: () => toast.error("Could not toggle that discount code."),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  };

  const startEdit = (dc: DiscountCode) => {
    setEditingId(dc.id);
    setForm({
      code: dc.code,
      discount_type: dc.discount_type,
      discount_value: parseFloat(dc.discount_value),
      min_order_amount: dc.min_order_amount ? parseFloat(dc.min_order_amount) : null,
      max_uses: dc.max_uses,
      is_active: dc.is_active,
      valid_from: dc.valid_from,
      valid_until: dc.valid_until,
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim()) { toast.error("Code is required."); return; }
    if (form.discount_value <= 0) { toast.error("Discount value must be greater than zero."); return; }
    if (form.discount_type === "percentage" && form.discount_value > 100) {
      toast.error("Percentage discount cannot exceed 100%.");
      return;
    }

    const payload: DiscountCodeCreate = {
      ...form,
      code: form.code.trim().toUpperCase(),
      min_order_amount: form.min_order_amount ?? 0,
      max_uses: form.max_uses ?? 0,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
    };

    if (editingId) {
      updateMutation.mutate({ discountId: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <PageTitle title={`Discount Codes — ${store?.name ?? "Store"} — Koraa`} />

      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Link
          href={`/dashboard/stores/${id}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            color: "var(--text-muted)", fontSize: 14, textDecoration: "none", marginBottom: 20,
          }}
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={15} /> Back to store
        </Link>

        <div
          style={{
            display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between",
            alignItems: "flex-end", marginBottom: 28,
          }}
        >
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.02em" }}>
              Discount Codes
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
              {discounts
                ? `${discounts.length} code${discounts.length === 1 ? "" : "s"} total.`
                : "Create codes your buyers can apply at checkout."}
            </p>
          </div>
          {!showForm && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { resetForm(); setShowForm(true); }}
            >
              <HugeiconsIcon icon={Add01Icon} size={16} /> New Code
            </button>
          )}
        </div>

        {/* ── Create / Edit form ─────────────────────────────────────── */}
        {showForm && (
          <div className="card" style={{ marginBottom: 24, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>
                {editingId ? "Edit Discount Code" : "New Discount Code"}
              </h2>
              <button
                type="button"
                onClick={resetForm}
                className="btn btn-secondary btn-sm"
                style={{ padding: "6px 10px" }}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={14} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Code *</label>
                  <input
                    className="input"
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="SUMMER20"
                    disabled={saving}
                    style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Type *</label>
                  <select
                    className="input"
                    value={form.discount_type}
                    onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value as DiscountType }))}
                    disabled={saving}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (XAF)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Value * {form.discount_type === "percentage" ? "(%)" : "(XAF)"}
                  </label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={form.discount_type === "percentage" ? 100 : undefined}
                    value={form.discount_value || ""}
                    onChange={(e) => setForm((f) => ({ ...f, discount_value: parseFloat(e.target.value) || 0 }))}
                    placeholder={form.discount_type === "percentage" ? "20" : "5000"}
                    disabled={saving}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Min Order Amount (XAF)</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={form.min_order_amount ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, min_order_amount: e.target.value ? parseFloat(e.target.value) : null }))}
                    placeholder="Optional"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Max Uses</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={form.max_uses ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value ? parseInt(e.target.value) : null }))}
                    placeholder="Unlimited"
                    disabled={saving}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 24 }}>
                  <input
                    type="checkbox"
                    id="dc-active"
                    checked={form.is_active}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                    disabled={saving}
                    style={{ accentColor: "var(--brand-500)" }}
                  />
                  <label htmlFor="dc-active" style={{ fontSize: 13, fontWeight: 600 }}>Active</label>
                </div>

                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Valid From</label>
                  <input
                    className="input"
                    type="datetime-local"
                    value={form.valid_from?.slice(0, 16) ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                    disabled={saving}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Valid Until</label>
                  <input
                    className="input"
                    type="datetime-local"
                    value={form.valid_until?.slice(0, 16) ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                    disabled={saving}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? (
                    <><HugeiconsIcon icon={Loading03Icon} size={16} className="spin" /> Saving…</>
                  ) : (
                    <><HugeiconsIcon icon={Tick02Icon} size={16} /> {editingId ? "Update" : "Create"}</>
                  )}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={saving}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── List ───────────────────────────────────────────────────── */}
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 68 }} />
            ))}
          </div>
        ) : !discounts?.length ? (
          <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
            <HugeiconsIcon icon={Discount01Icon} size={34} color="var(--text-muted)" style={{ margin: "0 auto 14px" }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>No discount codes yet</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 420, margin: "0 auto 18px" }}>
              Create a code and share it with your customers — they enter it at checkout for a discount.
            </p>
            {!showForm && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { resetForm(); setShowForm(true); }}
              >
                <HugeiconsIcon icon={Add01Icon} size={16} /> Create your first code
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {discounts.map((dc) => (
              <div
                key={dc.id}
                className="card"
                style={{
                  display: "flex", alignItems: "center", gap: 16, padding: "16px 20px",
                  opacity: dc.is_active ? 1 : 0.6,
                }}
              >
                <div
                  style={{
                    width: 44, height: 44, borderRadius: 0,
                    background: dc.is_active ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)",
                    border: `1px solid ${dc.is_active ? "rgba(34,197,94,0.2)" : "rgba(100,116,139,0.2)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}
                >
                  <HugeiconsIcon icon={Discount01Icon} size={20} color={dc.is_active ? "var(--brand-500)" : "#64748b"} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.04em", fontFamily: "monospace" }}>
                      {dc.code}
                    </span>
                    <span
                      className="badge"
                      style={{
                        background: dc.is_active ? "rgba(34,197,94,0.12)" : "rgba(100,116,139,0.12)",
                        color: dc.is_active ? "var(--brand-700, #15803d)" : "#64748b",
                      }}
                    >
                      {dc.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "2px 0 0" }}>
                    {dc.discount_type === "percentage"
                      ? `${parseFloat(dc.discount_value)}% off`
                      : `${parseInt(dc.discount_value).toLocaleString()} XAF off`}
                    {dc.min_order_amount ? ` · Min order ${parseInt(dc.min_order_amount).toLocaleString()} XAF` : ""}
                    {dc.max_uses ? ` · ${dc.used_count}/${dc.max_uses} used` : ` · ${dc.used_count} used`}
                  </p>
                </div>

                <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0, display: "none" }} className="dc-date">
                  {when(dc.created_at)}
                </span>

                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: "6px 10px" }}
                    title={dc.is_active ? "Deactivate" : "Activate"}
                    onClick={() => toggleMutation.mutate({ discountId: dc.id, is_active: !dc.is_active })}
                    disabled={toggleMutation.isPending}
                  >
                    {dc.is_active ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: "6px 10px" }}
                    title="Edit"
                    onClick={() => startEdit(dc)}
                  >
                    <HugeiconsIcon icon={Edit02Icon} size={14} />
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: "6px 10px", color: "var(--danger)" }}
                    title="Delete"
                    onClick={() => {
                      if (confirm(`Delete code "${dc.code}"? This cannot be undone.`)) {
                        deleteMutation.mutate(dc.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @media (min-width: 641px) {
          .dc-date { display: inline !important; }
        }
        @media (max-width: 640px) {
          .card { flex-wrap: wrap; }
        }
      `}</style>
    </>
  );
}
