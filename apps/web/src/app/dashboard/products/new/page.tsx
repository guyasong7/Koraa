"use client";

import PageTitle from "@/components/PageTitle";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { storeApi, productApi } from "@/lib/api";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  LuArrowLeft, LuLoader, LuPackage, LuSave, LuEye,
  LuTag, LuBox, LuInfo, LuUpload, LuX, LuImage, LuCheck,
  LuSparkles,
} from "react-icons/lu";
import { FiBarChart2 as LuBarChart2 } from "react-icons/fi";
import { useRef, useCallback } from "react";
import { DigitalFilesPanel, ServiceEnquiryPanel } from "@/components/DigitalDelivery";

interface ProductForm {
  name: string;
  description: string;
  short_description: string;
  product_type: "simple" | "variable" | "digital" | "service";
  base_price: string;
  compare_at_price: string;
  status: "draft" | "active";
  is_featured: boolean;
  weight: string;
  sku: string;
  stock_quantity: string;
  seo_title: string;
  seo_description: string;
  category: string;
  /** Digital delivery. Strings because they come straight from number inputs. */
  download_limit: string;
  download_window_days: string;
  accepts_enquiries: boolean;
}

const INITIAL: ProductForm = {
  name: "",
  description: "",
  short_description: "",
  product_type: "simple",
  base_price: "",
  compare_at_price: "",
  status: "draft",
  is_featured: false,
  weight: "",
  sku: "",
  stock_quantity: "0",
  seo_title: "",
  seo_description: "",
  category: "",
  download_limit: "5",
  download_window_days: "30",
  accepts_enquiries: true,
};

const PRODUCT_TYPES = [
  { value: "simple",   label: "Simple",   desc: "A single product with no variants" },
  { value: "variable", label: "Variable", desc: "Multiple variants (size, color, etc.)" },
  { value: "digital",  label: "Digital",  desc: "Downloadable file or key" },
  { value: "service",  label: "Service",  desc: "A bookable service or consultation" },
];

/* ─── Section wrapper ────────────────────────────────────────────── */
function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)", marginBottom: 16 }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon size={16} color="var(--brand-text)" />
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{title}</span>
      </div>
      <div style={{ padding: "24px" }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Field row ──────────────────────────────────────────────────── */
function Field({ label, hint, children, required }: { label: string; hint?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
        {label}{required && <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 5 }}>{hint}</p>}
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────── */
export default function NewProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store") ?? "";

  const [form, setForm] = useState<ProductForm>(INITIAL);
  // Image upload state — two-phase: create product first, then upload images
  const [pendingImages, setPendingImages] = useState<{ file: File; preview: string; removeBg: boolean }[]>([]);
  const [createdProductId, setCreatedProductId] = useState<string | null>(null);
  /** Digital assets chosen before the product exists. Uploaded right after it does. */
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [removeBgDefault, setRemoveBgDefault] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const set = (k: keyof ProductForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  /* Store list (to show store name) */
  const { data: storesData } = useQuery({
    queryKey: ["stores"],
    queryFn: () => storeApi.list().then(r => r.data),
  });
  const stores = storesData?.results ?? storesData ?? [];
  const store = stores.find((s: any) => s.id === storeId);

  /* Image helpers */
  const addFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const preview = URL.createObjectURL(file);
      setPendingImages(prev => [...prev, { file, preview, removeBg: removeBgDefault }]);
    });
  }, [removeBgDefault]);

  const removeImage = (idx: number) => setPendingImages(prev => prev.filter((_, i) => i !== idx));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  /* AI Auto-fill */
  const handleAIAssist = async () => {
    if (!pendingImages.length) {
      toast.error("Add an image first for AI to analyze.");
      return;
    }
    setAiLoading(true);
    const loadingToast = toast.loading("Analyzing image with AI...");
    try {
      const res = await productApi.aiSuggest(storeId, pendingImages[0].file);
      const data = res.data;
      setForm(prev => ({
        ...prev,
        name: data.name || prev.name,
        short_description: data.short_description || prev.short_description,
        description: data.description || prev.description,
        base_price: data.base_price || prev.base_price,
        weight: data.weight || prev.weight,
        seo_title: data.seo_title || prev.seo_title,
        seo_description: data.seo_description || prev.seo_description,
        sku: data.sku || prev.sku,
      }));
      toast.success("Form auto-filled by AI!", { id: loadingToast });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "AI auto-fill failed.";
      toast.error(msg, { id: loadingToast });
    } finally {
      setAiLoading(false);
    }
  };

  /* Upload all pending images to an already-created product */
  const uploadPendingImages = async (productId: string) => {
    if (!pendingImages.length) return;
    setUploadingImages(true);
    for (const item of pendingImages) {
      try {
        await productApi.uploadImage(storeId, productId, item.file, item.removeBg);
      } catch {
        toast.error(`Failed to upload ${item.file.name}`);
      }
    }
    setUploadingImages(false);
  };

  /**
   * Push the queued digital assets, once the product has an id to hang them on.
   *
   * Sequential rather than `Promise.all`: these are the large uploads, and four
   * 200 MB files sent at once on a mobile connection mostly yields four
   * timeouts.
   */
  const uploadPendingFiles = async (productId: string) => {
    if (!pendingFiles.length) return;
    for (const file of pendingFiles) {
      try {
        await productApi.uploadFile(storeId, productId, file);
      } catch (err: any) {
        toast.error(err?.response?.data?.detail || `Failed to upload ${file.name}`);
      }
    }
  };

  /* Create mutation */
  const createMutation = useMutation({
    mutationFn: (status: "draft" | "active") =>
      productApi.create(storeId, {
        name: form.name.trim(),
        description: form.description,
        short_description: form.short_description,
        product_type: form.product_type,
        base_price: form.base_price,
        compare_at_price: form.compare_at_price || undefined,
        status,
        is_featured: form.is_featured,
        weight: form.weight || undefined,
        seo_title: form.seo_title,
        seo_description: form.seo_description,
        category: form.category || undefined,
        sku: form.sku || undefined,
        stock_quantity: form.stock_quantity ? Number(form.stock_quantity) : 0,
        download_limit: Number(form.download_limit) || 0,
        download_window_days: Number(form.download_window_days) || 0,
        accepts_enquiries: form.accepts_enquiries,
      } as any),
    onSuccess: async (res) => {
      const product = res.data;
      setCreatedProductId(product.id);
      if (pendingImages.length) {
        toast.loading("Uploading images…", { id: "img-upload" });
        await uploadPendingImages(product.id);
        toast.dismiss("img-upload");
      }
      if (pendingFiles.length) {
        toast.loading("Uploading files…", { id: "file-upload" });
        await uploadPendingFiles(product.id);
        toast.dismiss("file-upload");
      }
      toast.success("Product created!");
      router.push(`/dashboard/products?store=${storeId}`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail
        || Object.values(err?.response?.data ?? {})[0]
        || "Failed to create product.";
      toast.error(Array.isArray(msg) ? msg[0] : String(msg));
    },
  });

  const handleSave = (status: "draft" | "active") => {
    if (!form.name.trim()) { toast.error("Product name is required."); return; }
    if (!form.base_price || isNaN(Number(form.base_price))) { toast.error("Enter a valid price."); return; }
    if (!storeId) { toast.error("No store selected."); return; }

    // Auto-generate SKU if blank
    let finalSku = form.sku.trim();
    if (!finalSku) {
      const prefix = form.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'PRD');
      finalSku = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
      setForm(prev => ({ ...prev, sku: finalSku }));
    }

    createMutation.mutate(status);
  };

  const isPending = createMutation.isPending;
  /** Mirrors `Product.is_stocked`: only physical products have a count. */
  const isStocked = form.product_type === "simple" || form.product_type === "variable";
  const salePercent = form.compare_at_price && form.base_price && Number(form.compare_at_price) > Number(form.base_price)
    ? Math.round((1 - Number(form.base_price) / Number(form.compare_at_price)) * 100)
    : null;

  if (!storeId) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <LuPackage size={40} color="var(--text-muted)" style={{ margin: "0 auto 16px" }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No store selected</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 20 }}>Please go to Products and select a store first.</p>
        <Link href="/dashboard/products" className="btn btn-primary">Go to Products</Link>
      </div>
    );
  }

  return (
    <>
      <PageTitle title="New Product — Koraa" />

      {/* ── Top bar ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--surface-900)", borderBottom: "1px solid var(--border)", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href={`/dashboard/products?store=${storeId}`} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)", textDecoration: "none", fontSize: 13 }}>
            <LuArrowLeft size={15} /> Products
          </Link>
          <span style={{ color: "var(--border)", fontSize: 18 }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>New Product</span>
          {store && (
            <>
              <span style={{ color: "var(--border)", fontSize: 18 }}>/</span>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{store.name}</span>
            </>
          )}
        </div>
        <div className="top-action-buttons" style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => handleSave("draft")} disabled={isPending}>
            {isPending ? <LuLoader size={14} className="spin" /> : <LuSave size={14} />}
            Save draft
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => handleSave("active")} disabled={isPending}>
            {isPending ? <LuLoader size={14} className="spin" /> : <LuEye size={14} />}
            Publish
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="products-new-grid" style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px", display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, alignItems: "start" }}>

        {/* ── Left column ── */}
        <div>

          {/* Basic info */}
          <Section title="Product Details" icon={LuPackage}>
            <Field label="Product name" required>
              <input
                className="input"
                placeholder="e.g. Premium Cotton T-Shirt"
                value={form.name}
                onChange={e => set("name", e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Short description" hint="Shown on product cards (max 500 chars)">
              <input
                className="input"
                placeholder="One-line summary of the product"
                value={form.short_description}
                onChange={e => set("short_description", e.target.value)}
                maxLength={500}
              />
            </Field>
            <Field label="Full description">
              <textarea
                className="input"
                placeholder="Detailed description, materials, care instructions…"
                value={form.description}
                onChange={e => set("description", e.target.value)}
                style={{ minHeight: 160, resize: "vertical" }}
              />
            </Field>
          </Section>

          {/* Pricing */}
          <Section title="Pricing" icon={LuTag}>
            <div className="mobile-stack-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Price" required hint={`In ${store?.currency ?? "your store's currency"}`}>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 14, fontWeight: 600 }}>
                    {store?.currency ?? "XAF"}
                  </span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.base_price}
                    onChange={e => set("base_price", e.target.value)}
                    style={{ paddingLeft: 52 }}
                  />
                </div>
              </Field>
              <Field label="Compare-at price" hint={salePercent ? `${salePercent}% off` : "Original price before discount"}>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 14, fontWeight: 600 }}>
                    {store?.currency ?? "XAF"}
                  </span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.compare_at_price}
                    onChange={e => set("compare_at_price", e.target.value)}
                    style={{ paddingLeft: 52, borderColor: salePercent ? "#22c55e" : undefined }}
                  />
                </div>
                {salePercent && (
                  <span style={{ display: "inline-block", marginTop: 6, background: "rgba(34,197,94,0.1)", color: "#16a34a", fontSize: 12, fontWeight: 600, padding: "2px 8px" }}>
                    {salePercent}% off
                  </span>
                )}
              </Field>
            </div>
          </Section>

          {form.product_type === "digital" && (
            <DigitalFilesPanel
              storeId={storeId}
              pending={pendingFiles}
              onPendingChange={setPendingFiles}
              limit={form.download_limit}
              onLimitChange={v => set("download_limit", v)}
              windowDays={form.download_window_days}
              onWindowChange={v => set("download_window_days", v)}
            />
          )}

          {form.product_type === "service" && (
            <ServiceEnquiryPanel
              storeId={storeId}
              acceptsEnquiries={form.accepts_enquiries}
              onChange={v => set("accepts_enquiries", v)}
            />
          )}

          {/* Inventory */}
          <Section title="Inventory" icon={LuBox}>
            <div className="mobile-stack-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="SKU" hint="Stock Keeping Unit — your internal reference">
                <input
                  className="input"
                  placeholder="e.g. SHIRT-BLK-M"
                  value={form.sku}
                  onChange={e => set("sku", e.target.value)}
                />
              </Field>
              {isStocked ? (
                <Field label="Stock quantity">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.stock_quantity}
                    onChange={e => set("stock_quantity", e.target.value)}
                  />
                </Field>
              ) : (
                <Field
                  label="Stock quantity"
                  hint={form.product_type === "digital"
                    ? "A file can be sold any number of times, so there is nothing to count."
                    : "A service is not held in a warehouse."}
                >
                  <input className="input" value="Not tracked" disabled />
                </Field>
              )}
            </div>
            {isStocked && (
              <Field label="Weight (kg)" hint="Used for shipping cost calculation">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="e.g. 0.5"
                  value={form.weight}
                  onChange={e => set("weight", e.target.value)}
                  style={{ maxWidth: 200 }}
                />
              </Field>
            )}
          </Section>

          {/* Images */}
          <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)", marginBottom: 16 }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <LuImage size={16} color="var(--brand-text)" />
                <span style={{ fontSize: 14, fontWeight: 700 }}>Product Images</span>
              </div>
              {/* Remove-background toggle */}
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                {pendingImages.length > 0 && (
                  <button
                    onClick={handleAIAssist}
                    disabled={aiLoading}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600,
                      color: "var(--brand-text)", background: "var(--brand-tint)", border: "none",
                      padding: "6px 12px", cursor: "pointer", transition: "background 0.2s",
                    }}
                  >
                    {aiLoading ? <LuLoader size={14} className="spin" /> : <LuSparkles size={14} />}
                    {aiLoading ? "Analyzing..." : "Auto-fill with AI"}
                  </button>
                )}
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                  <div
                    onClick={() => setRemoveBgDefault(v => !v)}
                    style={{
                      width: 36, height: 20, borderRadius: 0, background: removeBgDefault ? "var(--brand-solid)" : "var(--surface-700)",
                      position: "relative", cursor: "pointer", transition: "background .2s", border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 2, left: removeBgDefault ? 16 : 2,
                      width: 14, height: 14, background: "var(--surface-900)", transition: "left .2s",
                    }} />
                  </div>
                  <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>Auto remove background</span>
                  {removeBgDefault && <LuCheck size={13} color="var(--brand-text)" />}
                </label>
              </div>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Drop zone */}
              <div
                ref={dropRef}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? "var(--brand-solid)" : "var(--border)"}`,
                  background: isDragging ? "var(--brand-tint)" : "var(--surface)",
                  padding: "32px 20px", textAlign: "center", cursor: "pointer",
                  transition: "all .15s", marginBottom: pendingImages.length ? 16 : 0,
                }}
              >
                <LuUpload size={24} color="var(--text-muted)" style={{ margin: "0 auto 10px" }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                  Drop images here or click to browse
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  JPG, PNG, WEBP · Max 10 MB each · Snap with camera on mobile
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={e => e.target.files && addFiles(e.target.files)}
                />
              </div>

              {/* Image preview grid */}
              {pendingImages.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10 }}>
                  {pendingImages.map((img, idx) => (
                    <div key={idx} style={{ position: "relative", border: "1px solid var(--border)", aspectRatio: "1", overflow: "hidden" }}>
                      <img src={img.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      {/* Remove-bg indicator */}
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: img.removeBg ? "var(--brand-solid)" : "rgba(0,0,0,0.5)", padding: "3px 6px", fontSize: 10, fontWeight: 700, color: img.removeBg ? "var(--on-brand-solid)" : "#fff", textAlign: "center" }}>
                        {img.removeBg ? "BG REMOVE" : "ORIGINAL"}
                      </div>
                      {/* Toggle per-image */}
                      <button
                        onClick={() => setPendingImages(prev => prev.map((p, i) => i === idx ? { ...p, removeBg: !p.removeBg } : p))}
                        title="Toggle background removal"
                        style={{ position: "absolute", top: 4, left: 4, background: "var(--surface-900)", border: "1px solid var(--border)", padding: "3px 5px", fontSize: 10, cursor: "pointer", fontWeight: 700, color: "var(--brand-text)" }}
                      >
                        BG
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => removeImage(idx)}
                        style={{ position: "absolute", top: 4, right: 4, background: "var(--surface-900)", border: "1px solid var(--border)", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                      >
                        <LuX size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {uploadingImages && (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--brand-text)" }}>
                  <LuLoader size={15} className="spin" /> Processing images (removing backgrounds)…
                </div>
              )}
            </div>
          </div>

          {/* SEO */}
          <Section title="SEO" icon={LuBarChart2}>
            <Field label="SEO title" hint="Shown in search results (max 70 chars)">
              <input
                className="input"
                placeholder="Leave blank to use product name"
                value={form.seo_title}
                maxLength={70}
                onChange={e => set("seo_title", e.target.value)}
              />
              <div style={{ textAlign: "right", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                {form.seo_title.length}/70
              </div>
            </Field>
            <Field label="SEO description" hint="Shown in search results (max 160 chars)">
              <textarea
                className="input"
                placeholder="Summarise this product for search engines"
                value={form.seo_description}
                maxLength={160}
                onChange={e => set("seo_description", e.target.value)}
                style={{ minHeight: 80, resize: "vertical" }}
              />
              <div style={{ textAlign: "right", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                {form.seo_description.length}/160
              </div>
            </Field>
          </Section>

        </div>

        {/* ── Right column ── */}
        <div>

          {/* Status */}
          <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)", marginBottom: 16 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Status</span>
            </div>
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
              {(["draft", "active"] as const).map(s => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 12px", border: `1.5px solid ${form.status === s ? "var(--brand-solid)" : "var(--border)"}`, background: form.status === s ? "var(--brand-tint)" : "transparent" }}>
                  <input type="radio" name="status" value={s} checked={form.status === s} onChange={() => set("status", s)} style={{ accentColor: "var(--brand-solid)" }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, textTransform: "capitalize" }}>{s}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                      {s === "draft" ? "Not visible to customers" : "Visible and purchasable"}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Product type */}
          <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)", marginBottom: 16 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Product type</span>
            </div>
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
              {PRODUCT_TYPES.map(pt => (
                <label key={pt.value} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", padding: "10px 12px", border: `1.5px solid ${form.product_type === pt.value ? "var(--brand-solid)" : "var(--border)"}`, background: form.product_type === pt.value ? "var(--brand-tint)" : "transparent" }}>
                  <input type="radio" name="product_type" value={pt.value} checked={form.product_type === pt.value} onChange={() => set("product_type", pt.value as any)} style={{ accentColor: "var(--brand-solid)", marginTop: 2 }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{pt.label}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{pt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Options */}
          <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)", marginBottom: 16 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Options</span>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={e => set("is_featured", e.target.checked)}
                  style={{ accentColor: "var(--brand-solid)", width: 16, height: 16 }}
                />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Featured product</p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>Show in featured section on storefront</p>
                </div>
              </label>
            </div>
          </div>

          {/* Info box — only shown when no images queued */}
          {pendingImages.length === 0 && (
            <div style={{ background: "var(--brand-tint)", border: "1px solid var(--brand-tint-border)", padding: "14px 16px", display: "flex", gap: 10 }}>
              <LuInfo size={15} color="var(--brand-text)" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                Add images below or save first and upload later.
              </p>
            </div>
          )}

        </div>
      </div>

      {/* ── Bottom action bar (mobile) ── */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 10, background: "var(--surface-900)", borderTop: "1px solid var(--border)", padding: "12px 24px", display: "flex", justifyContent: "flex-end", gap: 10 }} className="mobile-action-bar">
        <button className="btn btn-secondary" onClick={() => handleSave("draft")} disabled={isPending}>
          {isPending ? <LuLoader size={14} className="spin" /> : <LuSave size={14} />}
          Save draft
        </button>
        <button className="btn btn-primary" onClick={() => handleSave("active")} disabled={isPending}>
          {isPending ? <LuLoader size={14} className="spin" /> : <LuEye size={14} />}
          Publish
        </button>
      </div>

      <style>{`
        @media (min-width: 769px) { .mobile-action-bar { display: none !important; } }
        @media (max-width: 768px) {
          .products-new-grid { grid-template-columns: 1fr !important; }
          .mobile-stack-grid { grid-template-columns: 1fr !important; }
          .top-action-buttons { display: none !important; }
        }
      `}</style>
    </>
  );
}
