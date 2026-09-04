"use client";
import PageTitle from "@/components/PageTitle";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth";
import { storeApi } from "@/lib/api";
import Link from "next/link";
import { LuArrowLeft, LuGlobe, LuExternalLink, LuInbox, LuMail, LuSettings, LuSlidersHorizontal, LuPackage, LuShoppingCart, LuPalette, LuSearch, LuSparkles, LuTrash2, LuLoader } from 'react-icons/lu';
import { FiBarChart2 as LuBarChart3 } from "react-icons/fi";
import toast from "react-hot-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function StoreDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  const deleteMutation = useMutation({
    mutationFn: (storeId: string) => storeApi.delete(storeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      toast.success("Store deleted successfully.");
      router.replace("/dashboard/stores");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to delete store.");
    }
  });

  const { data: store, isLoading } = useQuery({
    queryKey: ["store", id],
    queryFn: () => storeApi.get(id as string).then((r) => r.data),
    enabled: !!id && isAuthenticated,
  });

  if (isLoading) {
    return (
      <>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: 0 }} />
          ))}
        </div>
      </>
    );
  }

  if (!store) return null;

  const storefrontUrl: string = store.storefront_url || `https://${store.slug}.koraa.cm`;

  const QUICK_LINKS = [
    { label: "Products", href: `/dashboard/products?store=${id}`, icon: LuPackage, desc: "Manage your product catalogue" },
    { label: "Orders", href: `/dashboard/orders?store=${id}`, icon: LuShoppingCart, desc: "View and fulfil orders" },
    { label: "Analytics", href: `/dashboard/analytics?store=${id}`, icon: LuBarChart3, desc: "Track store performance" },
    { label: "Enquiries", href: `/dashboard/stores/${id}/enquiries`, icon: LuInbox, desc: "Leads sent through your enquiry form" },
    { label: "Enquiry Form", href: `/dashboard/stores/${id}/enquiry-form`, icon: LuMail, desc: "Choose what visitors are asked for a quote" },
    { label: "SEO", href: `/dashboard/stores/${id}/seo`, icon: LuSearch, desc: "Run an audit and fix what search engines miss" },
    { label: "Site Settings", href: `/dashboard/stores/${id}/site-settings`, icon: LuSlidersHorizontal, desc: "Availability, languages, privacy, crawlers and images" },
    { label: "Settings", href: `/dashboard/stores/${id}/settings`, icon: LuSettings, desc: "Customize your store" },
  ];

  return (
    <>
      <PageTitle title={`${store.name} — Koraa Dashboard`} />

      <>
        {/* Back */}
        <Link
          href="/dashboard/stores"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: 13, textDecoration: "none", marginBottom: 24 }}
        >
          <LuArrowLeft size={14} /> Back to stores
        </Link>

        {/* Store hero */}
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            padding: "32px 36px",
            marginBottom: 24,
            background: "var(--surface-900)",
            border: "1px solid var(--border)",
            borderLeft: "4px solid var(--brand-600)",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 0,
              background: "var(--surface-700)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <LuGlobe size={32} color="var(--brand-500)" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 className="font-display" style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
              {store.name}
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 12 }}>
              {store.tagline || "No tagline set"}
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a
                href={storefrontUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ gap: 6 }}
              >
                <LuExternalLink size={13} /> {storefrontUrl.replace(/^https?:\/\//, "")}
              </a>
              <Link
                href={`/dashboard/stores/${id}/blueprint`}
                className="btn btn-primary btn-sm"
                style={{ gap: 6 }}
              >
                <LuSparkles size={13} /> Design with Blueprint
              </Link>
              <Link
                href={`/dashboard/stores/${id}/settings?tab=customisation`}
                className="btn btn-secondary btn-sm"
                style={{ gap: 6 }}
              >
                <LuPalette size={13} /> Edit details
              </Link>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  borderRadius: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  background: store.status === "published" ? "rgba(34,197,94,0.12)" : "rgba(100,116,139,0.12)",
                  color: store.status === "published" ? "var(--brand-500)" : "#64748b",
                }}
              >
                {store.status === "published" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand-500)", display: "inline-block" }} />}
                {store.status.charAt(0).toUpperCase() + store.status.slice(1)}
              </span>
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Currency</p>
            <p style={{ fontSize: 18, fontWeight: 700, fontFamily: "Outfit, sans-serif" }}>{store.currency}</p>
          </div>
        </div>

        {/* Quick links grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {QUICK_LINKS.map(({ label, href, icon: Icon, desc }) => (
            <Link
              key={href}
              href={href}
              style={{ textDecoration: "none" }}
            >
              <div
                className="card"
                style={{ cursor: "pointer", transition: "border-color 0.2s, transform 0.2s" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,197,94,0.25)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,0,0,0.1)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 0,
                    background: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
                  }}
                >
                  <Icon size={20} color="var(--brand-500)" />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{label}</h3>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>{desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Danger Zone */}
        {store.is_owner !== false && (
          <div style={{ marginTop: 48, padding: 24, border: "1px solid rgba(239,68,68,0.3)", borderRadius: "12px", background: "rgba(239,68,68,0.05)" }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#ef4444", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <LuTrash2 size={20} /> Danger Zone
            </h3>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
              Permanently delete this store, including all its products, orders, and customer data. This action cannot be undone.
            </p>
            <button 
              onClick={() => setShowDeleteModal(true)}
              className="btn btn-secondary" 
              style={{ background: "var(--danger)", color: "#fff", borderColor: "transparent", padding: "12px 20px", minHeight: 46, fontSize: 15 }}
            >
              Delete Store
            </button>
          </div>
        )}
      </>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
        >
          <div className="modal-panel" style={{ maxWidth: 440, borderRadius: "16px" }}>
            <div className="modal-body" style={{ padding: "22px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger-text)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <LuTrash2 size={24} />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 10px 0", fontFamily: "var(--font-display)" }}>
                Delete store?
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: 15, margin: "0 0 18px 0", lineHeight: 1.55 }}>
                This action cannot be undone. All data associated with <strong style={{ color: "var(--text-primary)" }}>{store.name}</strong> will be permanently removed.
              </p>

              <div style={{ width: "100%", textAlign: "left" }}>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Type <strong>{store.name}</strong> to confirm:
                </label>
                <input
                  type="text"
                  className="input"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={store.name}
                  style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", fontSize: 15 }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowDeleteModal(false)} className="btn btn-secondary" style={{ flex: 1, minHeight: 46, padding: "12px", fontSize: 15, borderRadius: "8px", justifyContent: "center" }}>
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(store.id)}
                disabled={confirmName !== store.name || deleteMutation.isPending}
                className="btn btn-primary"
                style={{
                  flex: 1, minHeight: 46, padding: "12px", fontSize: 15, borderRadius: "8px", justifyContent: "center",
                  background: confirmName !== store.name ? "var(--surface-700)" : "var(--danger)",
                  color: confirmName !== store.name ? "var(--text-muted)" : "#fff",
                  borderColor: "transparent",
                  opacity: deleteMutation.isPending ? 0.8 : 1,
                  transition: "all 0.2s"
                }}
              >
                {deleteMutation.isPending ? <LuLoader size={17} className="spin" /> : "Delete Store"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
