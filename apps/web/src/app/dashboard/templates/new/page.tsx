"use client";

import PageTitle from "@/components/PageTitle";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/lib/toast";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  Loading03Icon,
  Upload04Icon,
  ImageUploadIcon,
  FileUploadIcon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";

export default function NewTemplatePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "0",
    currency: "XAF",
    template_type: "full_site" as "full_site" | "landing_page" | "product_page" | "checkout",
    category: "",
    tags: "",
    demo_url: "",
  });
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [previewImages, setPreviewImages] = useState<File[]>([]);
  const [sourceFiles, setSourceFiles] = useState<File | null>(null);

  const createTemplateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { templateApi } = await import("@/lib/api");
      const response = await templateApi.create(data as any);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success("Template submitted successfully! 🎉");
      router.push(`/templates/${data.slug}`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to create template.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data = new FormData();
    data.append("name", formData.name);
    data.append("description", formData.description);
    data.append("template_type", formData.template_type);

    if (formData.price !== "0") {
      data.append("price", formData.price);
      data.append("currency", formData.currency);
    }

    if (formData.category) data.append("category", formData.category);
    if (formData.demo_url) data.append("demo_url", formData.demo_url);

    if (formData.tags) {
      const tagsArray = formData.tags.split(",").map(t => t.trim());
      data.append("tags", JSON.stringify(tagsArray));
    }

    if (thumbnail) data.append("thumbnail", thumbnail);
    if (sourceFiles) data.append("source_files", sourceFiles);

    previewImages.forEach((file) => {
      data.append("preview_images", file);
    });

    createTemplateMutation.mutate(data);
  };

  if (!isAuthenticated) {
    router.replace("/login");
    return null;
  }

  return (
    <>
      <PageTitle title="Submit Template — Koraa Dashboard" />

      <div className="sf-container" style={{ padding: "clamp(16px, 4vw, 32px)", maxWidth: 900, margin: "0 auto" }}>
        <Link
          href="/templates"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: 13, textDecoration: "none", marginBottom: 24 }}
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={14} /> Back to templates
        </Link>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 8, fontFamily: "Outfit, sans-serif" }}>
            Submit a Template
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
            Share your storefront template with the Koraa community
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div className="form-group">
            <label className="form-label">Template Name *</label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Electronics Store Pro"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description *</label>
            <textarea
              className="form-input"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="A modern, responsive electronics storefront..."
              rows={4}
              required
              style={{ resize: "vertical" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Template Type *</label>
              <select
                className="form-input"
                value={formData.template_type}
                onChange={(e) => setFormData({ ...formData, template_type: e.target.value as any })}
                required
              >
                <option value="full_site">Full Site</option>
                <option value="landing_page">Landing Page</option>
                <option value="product_page">Product Page</option>
                <option value="checkout">Checkout</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                className="form-input"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="">Select category</option>
                <option value="fashion">Fashion</option>
                <option value="electronics">Electronics</option>
                <option value="food">Food & Beverage</option>
                <option value="beauty">Beauty & Cosmetics</option>
                <option value="general">General Store</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Price (XAF) *</label>
              <input
                type="number"
                className="form-input"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0"
                min="0"
                required
              />
              <small style={{ color: "var(--text-muted)", fontSize: 13 }}>Set to 0 for free template</small>
            </div>

            <div className="form-group">
              <label className="form-label">Currency</label>
              <select
                className="form-input"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              >
                <option value="XAF">XAF</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Tags</label>
            <input
              type="text"
              className="form-input"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="modern, responsive, electronics (comma-separated)"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Demo URL</label>
            <input
              type="url"
              className="form-input"
              value={formData.demo_url}
              onChange={(e) => setFormData({ ...formData, demo_url: e.target.value })}
              placeholder="https://demo.example.com"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Thumbnail Image</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label
                htmlFor="thumbnail-upload"
                className="btn btn-secondary"
                style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <HugeiconsIcon icon={ImageUploadIcon} size={16} />
                Choose Thumbnail
              </label>
              <input
                id="thumbnail-upload"
                type="file"
                accept="image/*"
                onChange={(e) => setThumbnail(e.target.files?.[0] || null)}
                style={{ display: "none" }}
              />
              {thumbnail && <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>{thumbnail.name}</span>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Preview Images</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label
                htmlFor="preview-upload"
                className="btn btn-secondary"
                style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <HugeiconsIcon icon={ImageUploadIcon} size={16} />
                Add Preview Images
              </label>
              <input
                id="preview-upload"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setPreviewImages(Array.from(e.target.files || []))}
                style={{ display: "none" }}
              />
              {previewImages.length > 0 && (
                <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                  {previewImages.length} file(s) selected
                </span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Source Files (ZIP) *</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label
                htmlFor="source-upload"
                className="btn btn-secondary"
                style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <HugeiconsIcon icon={FileUploadIcon} size={16} />
                Upload Source Files
              </label>
              <input
                id="source-upload"
                type="file"
                accept=".zip"
                onChange={(e) => setSourceFiles(e.target.files?.[0] || null)}
                style={{ display: "none" }}
                required
              />
              {sourceFiles && <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>{sourceFiles.name}</span>}
            </div>
            <small style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Upload your template as a ZIP file
            </small>
          </div>

          <div style={{ display: "flex", gap: 12, paddingTop: 16 }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createTemplateMutation.isPending}
              style={{ opacity: createTemplateMutation.isPending ? 0.8 : 1 }}
            >
              {createTemplateMutation.isPending ? (
                <>
                  <HugeiconsIcon icon={Loading03Icon} size={16} className="spin" /> Submitting...
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={Upload04Icon} size={16} /> Submit Template
                </>
              )}
            </button>
            <Link href="/templates" className="btn btn-secondary">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
