"use client";

import PageTitle from "@/components/PageTitle";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth";
import { storeApi, type Template } from "@/lib/api";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  Loading03Icon,
  PaintBoardIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";

export default function StoreTemplatesPage() {
  const router = useRouter();
  const params = useParams();
  const storeId = params.id as string;
  const { isAuthenticated } = useAuthStore();

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
      const { templateApi } = await import("@/lib/api");
      const response = await templateApi.list();
      return response.data;
    },
    enabled: isAuthenticated,
  });

  const templates: Template[] = Array.isArray(templatesData) ? templatesData : templatesData?.results ?? [];

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
              <Link
                key={template.id}
                href={`/dashboard/stores/${storeId}/templates/${template.slug}`}
                style={{
                  background: "var(--surface-900)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  overflow: "hidden",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  cursor: "pointer",
                  textDecoration: "none",
                  color: "inherit",
                  display: "block",
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
                  {template.is_featured && (
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
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>by {template.author.full_name || template.author.username || "Unknown"}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--brand-500)" }}>
                        {template.price === 0 ? "Free" : `${template.price.toLocaleString()} XAF`}
                      </div>
                    </div>
                    <span className="btn btn-primary btn-sm" style={{ fontSize: 13, padding: "8px 16px" }}>
                      View Details
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
