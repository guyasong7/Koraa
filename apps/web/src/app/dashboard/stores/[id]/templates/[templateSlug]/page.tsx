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
  UserIcon,
  Download01Icon,
  Star01Icon,
  EyeIcon,
} from "@hugeicons/core-free-icons";
import axios from "axios";

type Template = {
  id: string;
  slug: string;
  name: string;
  description: string;
  long_description: string;
  price: number;
  author_name: string;
  author_email: string;
  thumbnail: string;
  preview_images: string[];
  category: string;
  featured: boolean;
  verified: boolean;
  downloads_count: number;
  features: string[];
  demo_url: string;
  documentation_url: string;
  created_at: string;
  updated_at: string;
};

export default function TemplateDetailPage() {
  const router = useRouter();
  const params = useParams();
  const storeId = params.id as string;
  const templateSlug = params.templateSlug as string;
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [activePreviewImage, setActivePreviewImage] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  const { data: store } = useQuery({
    queryKey: ["store", storeId],
    queryFn: () => storeApi.get(storeId).then((r) => r.data),
    enabled: !!storeId && isAuthenticated,
  });

  const { data: template, isLoading } = useQuery({
    queryKey: ["template", templateSlug],
    queryFn: async () => {
      const response = await axios.get(`https://api.koraa.cm/api/v1/templates/${templateSlug}/`);
      return response.data;
    },
    enabled: !!templateSlug && isAuthenticated,
  });

  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await axios.post(
        `https://api.koraa.cm/api/v1/stores/${storeId}/apply-template/`,
        { template_id: templateId }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store", storeId] });
      toast.success("Template applied successfully! 🎉");
      setShowApplyModal(false);
      router.push(`/dashboard/stores/${storeId}`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to apply template.");
    },
  });

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <HugeiconsIcon icon={Loading03Icon} size={36} className="spin" color="var(--brand-500)" />
      </div>
    );
  }

  if (!template) return null;

  return (
    <>
      <PageTitle title={`${template.name} — Templates — Koraa Dashboard`} />

      <div className="sf-container" style={{ padding: "clamp(16px, 4vw, 32px)", maxWidth: 1400, margin: "0 auto" }}>
        {/* Back */}
        <Link
          href={`/dashboard/stores/${storeId}/templates`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: 13, textDecoration: "none", marginBottom: 24 }}
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={14} /> Back to templates
        </Link>

        {/* Two column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 32, alignItems: "start" }}>
          {/* Left: Preview and details */}
          <div>
            {/* Preview image */}
            <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden", marginBottom: 24 }}>
              <div style={{ width: "100%", aspectRatio: "16/10", background: "var(--surface-700)", position: "relative", overflow: "hidden" }}>
                {template.thumbnail ? (
                  <img
                    src={template.preview_images?.[activePreviewImage] || template.thumbnail}
                    alt={template.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <HugeiconsIcon icon={PaintBoardIcon} size={64} color="var(--text-muted)" />
                  </div>
                )}
                {template.featured && (
                  <div style={{ position: "absolute", top: 20, right: 20, padding: "8px 16px", background: "rgba(168,85,247,0.95)", color: "white", fontSize: 13, fontWeight: 700, borderRadius: "8px", display: "flex", alignItems: "center", gap: 6 }}>
                    <HugeiconsIcon icon={SparklesIcon} size={16} /> Featured
                  </div>
                )}
              </div>

              {/* Preview thumbnails */}
              {template.preview_images && template.preview_images.length > 1 && (
                <div style={{ display: "flex", gap: 8, padding: 16, background: "var(--surface-800)" }}>
                  {template.preview_images.map((img: string, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setActivePreviewImage(idx)}
                      style={{
                        width: 80,
                        height: 60,
                        border: activePreviewImage === idx ? "2px solid var(--brand-500)" : "2px solid transparent",
                        borderRadius: "6px",
                        overflow: "hidden",
                        cursor: "pointer",
                        background: "var(--surface-700)",
                        padding: 0,
                      }}
                    >
                      <img src={img} alt={`Preview ${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Template info */}
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8, fontFamily: "Outfit, sans-serif", letterSpacing: "-0.02em" }}>
                {template.name}
              </h1>
              <p style={{ color: "var(--text-secondary)", fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>
                {template.description}
              </p>

              {/* Stats */}
              <div style={{ display: "flex", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <HugeiconsIcon icon={Download01Icon} size={18} color="var(--text-muted)" />
                  <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>{template.downloads_count} downloads</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <HugeiconsIcon icon={UserIcon} size={18} color="var(--text-muted)" />
                  <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>by {template.author_name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ padding: "4px 12px", background: "var(--surface-800)", borderRadius: "6px", fontSize: 13, fontWeight: 600 }}>
                    {template.category}
                  </div>
                </div>
              </div>

              {/* Long description */}
              {template.long_description && (
                <div style={{ marginBottom: 32 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, fontFamily: "Outfit, sans-serif" }}>
                    About This Template
                  </h2>
                  <p style={{ color: "var(--text-secondary)", fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-line" }}>
                    {template.long_description}
                  </p>
                </div>
              )}

              {/* Features */}
              {template.features && template.features.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, fontFamily: "Outfit, sans-serif" }}>
                    Key Features
                  </h2>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
                    {template.features.map((feature: string, idx: number) => (
                      <li key={idx} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(168,85,247,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                          <HugeiconsIcon icon={Tick02Icon} size={12} color="var(--brand-500)" />
                        </div>
                        <span style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-secondary)" }}>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Links */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {template.demo_url && (
                  <a
                    href={template.demo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ gap: 8 }}
                  >
                    <HugeiconsIcon icon={EyeIcon} size={16} /> View Demo
                  </a>
                )}
                {template.documentation_url && (
                  <a
                    href={template.documentation_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ gap: 8 }}
                  >
                    Documentation
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Right: Sidebar with pricing and CTA */}
          <div style={{ position: "sticky", top: 20 }}>
            <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: "12px", padding: 24 }}>
              {/* Price */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>Price</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: template.price === 0 ? "var(--success)" : "var(--brand-500)", fontFamily: "Outfit, sans-serif" }}>
                  {template.price === 0 ? "Free" : `${template.price.toLocaleString()} XAF`}
                </div>
              </div>

              {/* Apply button */}
              <button
                onClick={() => setShowApplyModal(true)}
                className="btn btn-primary"
                style={{ width: "100%", fontSize: 16, padding: "14px 24px", marginBottom: 16 }}
              >
                <HugeiconsIcon icon={Tick02Icon} size={18} /> Apply to Store
              </button>

              {/* Info box */}
              <div style={{ padding: 16, background: "var(--surface-800)", borderRadius: "8px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>What happens when you apply:</div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>Template design is applied to {store?.name}</li>
                  <li>Your products and settings are preserved</li>
                  <li>Changes take effect immediately</li>
                </ul>
              </div>

              {/* Creator info */}
              <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                  Created by
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--brand-500)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <HugeiconsIcon icon={UserIcon} size={20} color="white" />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{template.author_name}</div>
                    {template.author_email && (
                      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{template.author_email}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Apply confirmation modal */}
      {showApplyModal && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setShowApplyModal(false); }}
        >
          <div className="modal-panel" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, fontFamily: "var(--font-display)" }}>
                Apply Template
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "8px 0 0 0" }}>
                Apply "{template.name}" to your store
              </p>
            </div>

            <div className="modal-body">
              {template.price > 0 ? (
                <div style={{ padding: "16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", marginBottom: 16 }}>
                  <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 4 }}>Total</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--brand-500)" }}>
                    {template.price.toLocaleString()} XAF
                  </div>
                </div>
              ) : (
                <div style={{ padding: "16px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "8px", marginBottom: 16, color: "#22c55e", fontSize: 14, fontWeight: 600 }}>
                  ✓ This template is free!
                </div>
              )}

              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                This will apply the template design to <strong>{store?.name}</strong>. Your existing products and settings will be preserved.
              </p>
            </div>

            <div className="modal-footer">
              <button
                onClick={() => setShowApplyModal(false)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={() => applyTemplateMutation.mutate(template.id)}
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
