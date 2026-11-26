"use client";

import PageTitle from "@/components/PageTitle";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth";
import { storeApi } from "@/lib/api";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  Loading03Icon,
  PaintBoardIcon,
  Tick02Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import axios from "axios";

type Template = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  author_name: string;
  thumbnail: string;
  category: string;
  featured: boolean;
  verified: boolean;
  downloads_count: number;
};

export default function StoreTemplatesPage() {
  const router = useRouter();
  const params = useParams();
  const storeId = params.id as string;
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  const { data: store, isLoading: storeLoading } = useQuery({
    queryKey: ["store", storeId],
    queryFn: () => storeApi.get(storeId).then((r) => r.data),
    enabled: !!storeId && isAuthenticated,
  });

  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const response = await axios.get("https://api.koraa.cm/api/v1/templates/");
      return response.data;
    },
    enabled: isAuthenticated,
  });

  const templates: Template[] = templatesData?.results ?? templatesData ?? [];

  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      // This will be implemented on the backend to apply template to store
      const response = await axios.post(
        `https://api.koraa.cm/api/v1/stores/${storeId}/apply-template/`,
        { template_id: templateId }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store", storeId] });
      toast.success("Template applied successfully! 🎉");
      setSelectedTemplate(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to apply template.");
    },
  });

  if (storeLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <HugeiconsIcon icon={Loading03Icon} size={36} className="spin" color="var(--brand-500)" />
      </div>
    );
  }

  if (!store) return null;

  const CATEGORIES = [
    { id: "all", label: "All Templates" },
    { id: "fashion", label: "Fashion" },
    { id: "electronics", label: "Electronics" },
    { id: "food", label: "Food & Drinks" },
    { id: "beauty", label: "Beauty" },
  ];

  const [activeCategory, setActiveCategory] = useState("all");

  const filteredTemplates = activeCategory === "all"
    ? templates
    : templates.filter(t => t.category === activeCategory);

  return (
    <>
      <PageTitle title={`Templates — ${store.name} — Koraa Dashboard`} />

      <div className="sf-container" style={{ padding: "clamp(16px, 4vw, 32px)", maxWidth: 1200, margin: "0 auto" }}>
        {/* Back */}
        <Link
          href={`/dashboard/stores/${storeId}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: 13, textDecoration: "none", marginBottom: 24 }}
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={14} /> Back to store
        </Link>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 8, fontFamily: "Outfit, sans-serif", letterSpacing: "-0.02em" }}>
            Store Templates
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
            Choose a professional template to customize your store's look and feel
          </p>
        </div>

        {/* Category filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: activeCategory === cat.id ? "var(--brand-500)" : "var(--surface-900)",
                color: activeCategory === cat.id ? "white" : "var(--text-primary)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Templates grid */}
        {templatesLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <HugeiconsIcon icon={Loading03Icon} size={36} className="spin" color="var(--brand-500)" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", background: "var(--surface-900)", border: "2px dashed var(--border)", borderRadius: "12px" }}>
            <HugeiconsIcon icon={PaintBoardIcon} size={48} color="var(--text-muted)" style={{ marginBottom: 16 }} />
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No templates found</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Try selecting a different category</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 24 }}>
            {filteredTemplates.map(template => (
              <div
                key={template.id}
                style={{
                  background: "var(--surface-900)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  overflow: "hidden",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  cursor: "pointer",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 32px rgba(0,0,0,0.12)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "none";
                }}
              >
                {/* Thumbnail */}
                <div style={{ width: "100%", height: 180, background: "var(--surface-700)", position: "relative", overflow: "hidden" }}>
                  {template.thumbnail ? (
                    <img src={template.thumbnail} alt={template.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <HugeiconsIcon icon={PaintBoardIcon} size={40} color="var(--text-muted)" />
                    </div>
                  )}
                  {template.featured && (
                    <div style={{ position: "absolute", top: 12, right: 12, padding: "4px 10px", background: "rgba(168,85,247,0.95)", color: "white", fontSize: 11, fontWeight: 700, borderRadius: "6px", display: "flex", alignItems: "center", gap: 4 }}>
                      <HugeiconsIcon icon={SparklesIcon} size={12} /> Featured
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: "16px" }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, fontFamily: "Outfit, sans-serif" }}>
                    {template.name}
                  </h3>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.4 }}>
                    {template.description}
                  </p>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>by {template.author_name}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--brand-500)" }}>
                        {template.price === 0 ? "Free" : `${template.price.toLocaleString()} XAF`}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedTemplate(template)}
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: 13, padding: "8px 16px" }}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {selectedTemplate && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setSelectedTemplate(null); }}
        >
          <div className="modal-panel" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, fontFamily: "var(--font-display)" }}>
                Apply Template
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "8px 0 0 0" }}>
                Apply "{selectedTemplate.name}" to your store
              </p>
            </div>

            <div className="modal-body">
              {selectedTemplate.price > 0 ? (
                <div style={{ padding: "16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", marginBottom: 16 }}>
                  <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 4 }}>Total</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--brand-500)" }}>
                    {selectedTemplate.price.toLocaleString()} XAF
                  </div>
                </div>
              ) : (
                <div style={{ padding: "16px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "8px", marginBottom: 16, color: "#22c55e", fontSize: 14, fontWeight: 600 }}>
                  ✓ This template is free!
                </div>
              )}

              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                This will apply the template design to <strong>{store.name}</strong>. Your existing products and settings will be preserved.
              </p>
            </div>

            <div className="modal-footer">
              <button
                onClick={() => setSelectedTemplate(null)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={() => applyTemplateMutation.mutate(selectedTemplate.id)}
                disabled={applyTemplateMutation.isPending}
                className="btn btn-primary"
                style={{ flex: 1, opacity: applyTemplateMutation.isPending ? 0.8 : 1 }}
              >
                {applyTemplateMutation.isPending ? (
                  <><HugeiconsIcon icon={Loading03Icon} size={16} className="spin" /> Applying...</>
                ) : (
                  <><HugeiconsIcon icon={Tick02Icon} size={16} /> Confirm</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
