"use client";

import PageTitle from "@/components/PageTitle";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { storeApi, productApi, categoryApi, Category } from "@/lib/api";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  LuArrowLeft, LuLoader, LuPackage, LuSave, LuEye,
  LuTag, LuBox, LuInfo, LuUpload, LuX, LuImage, LuCheck,
  LuSparkles, LuTrash2, LuFolder
} from "react-icons/lu";
import { FiBarChart2 as LuBarChart2 } from "react-icons/fi";
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
  name: "", description: "", short_description: "", product_type: "simple",
  base_price: "", compare_at_price: "", status: "draft", is_featured: false,
  weight: "", sku: "", stock_quantity: "0", seo_title: "", seo_description: "", category: "",
  download_limit: "5", download_window_days: "30", accepts_enquiries: true,
};

const PRODUCT_TYPES = [
  { value: "simple",   label: "Simple",   desc: "A single product with no variants" },
  { value: "variable", label: "Variable", desc: "Multiple variants (size, color, etc.)" },
  { value: "digital",  label: "Digital",  desc: "Downloadable file or key" },
  { value: "service",  label: "Service",  desc: "A bookable service or consultation" },
];

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)", marginBottom: 16 }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon size={16} color="var(--brand-text)" />
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{title}</span>
      </div>
      <div style={{ padding: "24px" }}>{children}</div>
    </div>
  );
}

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

export default function EditProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const storeId = searchParams.get("store") ?? "";
  const productId = params.id as string;
  const queryClient = useQueryClient();

  const [form, setForm] = useState<ProductForm>(INITIAL);
  const [pendingImages, setPendingImages] = useState<{ file: File; preview: string; removeBg: boolean }[]>([]);
  /** Digital assets chosen but not yet uploaded. Sent when the product is saved. */
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [removeBgDefault, setRemoveBgDefault] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const set = (k: keyof ProductForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  const { data: storesData } = useQuery({ queryKey: ["stores"], queryFn: () => storeApi.list().then(r => r.data) });
  const store = (storesData?.results ?? storesData ?? []).find((s: any) => s.id === storeId);

  const { data: productData, isLoading: isLoadingProduct } = useQuery({
    queryKey: ["product", storeId, productId],
    queryFn: () => productApi.get(storeId, productId).then(r => r.data),
    enabled: !!storeId && !!productId,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["categories", storeId],
    queryFn: () => storeId ? categoryApi.list(storeId).then(r => r.data) : Promise.resolve([]),
    enabled: !!storeId,
  });
  const categories: Category[] = (categoriesData as any)?.results ?? categoriesData ?? [];

  useEffect(() => {
    if (productData) {
      setForm({
        name: productData.name || "",
        description: productData.description || "",
        short_description: productData.short_description || "",
        product_type: productData.product_type || "simple",
        base_price: productData.base_price || "",
        compare_at_price: productData.compare_at_price || "",
        status: productData.status || "draft",
        is_featured: productData.is_featured || false,
        weight: productData.weight || "",
        sku: productData.sku || "",
        stock_quantity: productData.stock_quantity || "0",
        seo_title: productData.seo_title || "",
        seo_description: productData.seo_description || "",
        category: productData.category || "",
        // ?? rather than ||: 0 is a meaningful value on both of these — it
        // means unlimited downloads and a link that never expires.
        download_limit: String(productData.download_limit ?? 5),
        download_window_days: String(productData.download_window_days ?? 30),
        accepts_enquiries: productData.accepts_enquiries ?? true,
      });
    }
  }, [productData]);

  const existingImages = productData?.images || [];

  const addFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const preview = URL.createObjectURL(file);
      setPendingImages(prev => [...prev, { file, preview, removeBg: removeBgDefault }]);
    });
  }, [removeBgDefault]);

  const removePendingImage = (idx: number) => setPendingImages(prev => prev.filter((_, i) => i !== idx));

  const handleDeleteExistingImage = async (imageId: string) => {
    if (!confirm("Delete this image?")) return;
    try {
      await productApi.deleteImage(storeId, productId, imageId);
      queryClient.invalidateQueries({ queryKey: ["product", storeId, productId] });
      toast.success("Image deleted");
    } catch {
      toast.error("Failed to delete image");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const handleAIAssist = async () => {
    let fileToAnalyze: File | null = null;
    
    // Use pending image if available
    if (pendingImages.length > 0) {
      fileToAnalyze = pendingImages[0].file;
    } else if (existingImages.length > 0) {
      // If they want to use an existing image for AI, they'd have to re-upload for now, 
      // but let's prompt them to upload one.
      toast.error("Add a new image below for AI to analyze.");
      return;
    } else {
      toast.error("Add an image first for AI to analyze.");
      return;
    }

    setAiLoading(true);
    const loadingToast = toast.loading("Analyzing image with DeepSeek AI...");
    try {
      const res = await productApi.aiSuggest(storeId, fileToAnalyze);
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

  const uploadPendingImages = async () => {
    if (!pendingImages.length) return;
    setUploadingImages(true);
    let successCount = 0;
    for (const item of pendingImages) {
      try {
        await productApi.uploadImage(storeId, productId, item.file, item.removeBg);
        successCount++;
      } catch {
        toast.error(`Failed to upload ${item.file.name}`);
      }
    }
    setUploadingImages(false);
    if (successCount > 0) {
      setPendingImages([]);
      queryClient.invalidateQueries({ queryKey: ["product", storeId, productId] });
    }
  };

  /**
   * Push the queued digital assets.
   *
   * Sequential, not `Promise.all`: these are the large uploads, and a merchant
   * on a Douala connection sending four 200 MB files at once mostly gets four
   * timeouts. A file that fails is kept in the queue so the next save retries
   * only that one.
   */
  const uploadPendingFiles = async () => {
    if (!pendingFiles.length) return;
    const failed: File[] = [];
    for (const file of pendingFiles) {
      try {
        await productApi.uploadFile(storeId, productId, file);
      } catch (err: any) {
        failed.push(file);
        toast.error(err?.response?.data?.detail || `Failed to upload ${file.name}`);
      }
    }
    setPendingFiles(failed);
    queryClient.invalidateQueries({ queryKey: ["product-files", storeId, productId] });
    queryClient.invalidateQueries({ queryKey: ["product", storeId, productId] });
  };

  const updateMutation = useMutation({
    mutationFn: (status: "draft" | "active") =>
      productApi.update(storeId, productId, {
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
    onSuccess: async () => {
      if (pendingImages.length) {
        toast.loading("Uploading images…", { id: "img-upload" });
        await uploadPendingImages();
        toast.dismiss("img-upload");
      }
      if (pendingFiles.length) {
        toast.loading("Uploading files…", { id: "file-upload" });
        await uploadPendingFiles();
        toast.dismiss("file-upload");
      }
      toast.success("Product updated!");
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || Object.values(err?.response?.data ?? {})[0] || "Failed to update product.";
      toast.error(Array.isArray(msg) ? msg[0] : String(msg));
    },
  });

  const handleSave = (status: "draft" | "active") => {
    if (!form.name.trim()) { toast.error("Product name is required."); return; }
    if (!form.description.trim()) { toast.error("Product description is required."); return; }
    if (!form.base_price || isNaN(Number(form.base_price))) { toast.error("Enter a valid price."); return; }
    if (!storeId) { toast.error("No store selected."); return; }
    updateMutation.mutate(status);
  };

  const isPending = updateMutation.isPending || isLoadingProduct;
  /** Mirrors `Product.is_stocked`: only physical products have a count. */
  const isStocked = form.product_type === "simple" || form.product_type === "variable";
  const salePercent = form.compare_at_price && form.base_price && Number(form.compare_at_price) > Number(form.base_price)
    ? Math.round((1 - Number(form.base_price) / Number(form.compare_at_price)) * 100) : null;

  if (!storeId) return <div style={{ padding: 48, textAlign: "center" }}>No store selected</div>;

  return (
    <>
      <PageTitle title="Edit Product — Koraa" />

      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--surface-900)", borderBottom: "1px solid var(--border)", padding: "12px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href={`/dashboard/products?store=${storeId}`} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)", textDecoration: "none", fontSize: 13 }}>
            <LuArrowLeft size={15} /> Products
          </Link>
          <span style={{ color: "var(--border)", fontSize: 18 }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Edit Product</span>
        </div>
        <div className="top-action-buttons" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => handleSave("draft")} disabled={isPending}>
            {isPending ? <LuLoader size={14} className="spin" /> : <LuSave size={14} />} Save draft
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => handleSave("active")} disabled={isPending}>
            {isPending ? <LuLoader size={14} className="spin" /> : <LuEye size={14} />} Publish
          </button>
        </div>
      </div>

      <div className="products-new-grid" style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px", display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
        
        {/* LEFT COLUMN */}
        <div>
          <Section title="Product Details" icon={LuPackage}>
            <Field label="Product name" required>
              <input className="input" value={form.name} onChange={e => set("name", e.target.value)} />
            </Field>
            <Field label="Short description" hint="Shown on product cards (max 500 chars)">
              <input className="input" value={form.short_description} onChange={e => set("short_description", e.target.value)} maxLength={500} />
            </Field>
            <Field label="Full description" required>
              <textarea className="input" value={form.description} onChange={e => set("description", e.target.value)} style={{ minHeight: 160, resize: "vertical" }} />
            </Field>
          </Section>

          <Section title="Pricing" icon={LuTag}>
            <div className="mobile-stack-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Price" required>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 14, fontWeight: 600 }}>{store?.currency ?? "XAF"}</span>
                  <input className="input" type="number" min="0" step="0.01" value={form.base_price} onChange={e => set("base_price", e.target.value)} style={{ paddingLeft: 52 }} />
                </div>
              </Field>
              <Field label="Compare-at price">
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 14, fontWeight: 600 }}>{store?.currency ?? "XAF"}</span>
                  <input className="input" type="number" min="0" step="0.01" value={form.compare_at_price} onChange={e => set("compare_at_price", e.target.value)} style={{ paddingLeft: 52 }} />
                </div>
              </Field>
            </div>
          </Section>

          {form.product_type === "digital" && (
            <DigitalFilesPanel
              storeId={storeId}
              productId={productId}
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

          <Section title="Inventory" icon={LuBox}>
            <div className="mobile-stack-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="SKU"><input className="input" value={form.sku} onChange={e => set("sku", e.target.value)} /></Field>
              {isStocked ? (
                <Field label="Stock quantity"><input className="input" type="number" min="0" value={form.stock_quantity} onChange={e => set("stock_quantity", e.target.value)} /></Field>
              ) : (
                <Field label="Stock quantity" hint={form.product_type === "digital" ? "A file can be sold any number of times, so there is nothing to count." : "A service is not held in a warehouse."}>
                  <input className="input" value="Not tracked" disabled />
                </Field>
              )}
            </div>
            {isStocked && (
              <Field label="Weight (kg)"><input className="input" type="number" min="0" step="0.001" value={form.weight} onChange={e => set("weight", e.target.value)} style={{ maxWidth: 200 }} /></Field>
            )}
          </Section>

          <Section title="SEO" icon={LuBarChart2}>
            <Field label="SEO title"><input className="input" value={form.seo_title} maxLength={70} onChange={e => set("seo_title", e.target.value)} /></Field>
            <Field label="SEO description"><textarea className="input" value={form.seo_description} maxLength={160} onChange={e => set("seo_description", e.target.value)} style={{ minHeight: 80, resize: "vertical" }} /></Field>
          </Section>
        </div>

        {/* RIGHT COLUMN (Sidebar) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Media Section */}
          <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <LuImage size={15} color="var(--brand-text)" />
                <span style={{ fontSize: 13, fontWeight: 700 }}>Media</span>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <div onClick={() => setRemoveBgDefault(!removeBgDefault)} style={{ width: 28, height: 16, background: removeBgDefault ? "var(--brand-solid)" : "var(--surface-700)", position: "relative", border: "1px solid var(--border)" }}>
                  <div style={{ position: "absolute", top: 1, left: removeBgDefault ? 13 : 1, width: 12, height: 12, background: "var(--surface-900)", transition: "left .2s" }} />
                </div>
                <span style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 600 }}>Auto-BG</span>
              </label>
            </div>
            
            <div style={{ padding: "16px" }}>
              {/* Existing Images */}
              {existingImages.length > 0 && (
                <div className="mobile-stack-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                  {existingImages.map((img: any) => (
                    <div key={img.id} style={{ position: "relative", border: "1px solid var(--border)", aspectRatio: "1", overflow: "hidden", borderRadius: 4 }}>
                      <img src={img.image} alt="Product" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button onClick={() => handleDeleteExistingImage(img.id)} style={{ position: "absolute", top: 4, right: 4, background: "var(--surface-900)", border: "1px solid var(--border)", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--danger)" }}>
                        <LuTrash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload New Image */}
              <div
                ref={dropRef}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `1.5px dashed ${isDragging ? "var(--brand-solid)" : "var(--border)"}`,
                  background: isDragging ? "var(--brand-tint)" : "var(--surface)",
                  padding: "20px 16px", textAlign: "center", cursor: "pointer",
                  transition: "all .15s", borderRadius: 4, marginBottom: pendingImages.length ? 12 : 0,
                }}
              >
                <LuUpload size={20} color="var(--text-muted)" style={{ margin: "0 auto 8px" }} />
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>Click to upload new</p>
                <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => e.target.files && addFiles(e.target.files)} />
              </div>

              {/* Pending Images */}
              {pendingImages.length > 0 && (
                <div className="mobile-stack-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {pendingImages.map((img, idx) => (
                    <div key={idx} style={{ position: "relative", border: "1px solid var(--border)", aspectRatio: "1", overflow: "hidden", borderRadius: 4 }}>
                      <img src={img.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.7 }} />
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: img.removeBg ? "var(--brand-solid)" : "rgba(0,0,0,0.5)", padding: "2px", fontSize: 9, fontWeight: 700, color: img.removeBg ? "var(--on-brand-solid)" : "#fff", textAlign: "center" }}>
                        {img.removeBg ? "NO BG" : "ORIGINAL"}
                      </div>
                      <button onClick={() => removePendingImage(idx)} style={{ position: "absolute", top: 4, right: 4, background: "var(--surface-900)", border: "1px solid var(--border)", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <LuX size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {pendingImages.length > 0 && (
                <button
                  onClick={handleAIAssist}
                  disabled={aiLoading}
                  style={{ width: "100%", marginTop: 12, display: "flex", justifyContent: "center", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--brand-text)", background: "var(--brand-tint)", border: "1px solid var(--brand-tint-border)", padding: "8px", cursor: "pointer" }}
                >
                  {aiLoading ? <LuLoader size={14} className="spin" /> : <LuSparkles size={14} />}
                  {aiLoading ? "Analyzing..." : "Auto-fill with DeepSeek"}
                </button>
              )}
              
              {uploadingImages && (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--brand-text)" }}>
                  <LuLoader size={14} className="spin" /> Processing...
                </div>
              )}
            </div>
          </div>

          <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Status</span>
            </div>
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
              {(["draft", "active"] as const).map(s => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 12px", border: `1.5px solid ${form.status === s ? "var(--brand-solid)" : "var(--border)"}`, background: form.status === s ? "var(--brand-tint)" : "transparent" }}>
                  <input type="radio" name="status" value={s} checked={form.status === s} onChange={() => set("status", s)} style={{ accentColor: "var(--brand-solid)" }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, textTransform: "capitalize" }}>{s}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{s === "draft" ? "Hidden" : "Visible"}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)" }}>
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

          {/* Organization */}
          <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)", marginBottom: 16 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><LuFolder size={14} /> Organization</span>
            </div>
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Category</label>
                <div style={{ position: "relative" }}>
                  <select
                    className="input"
                    value={form.category}
                    onChange={e => set("category", e.target.value)}
                    style={{ width: "100%", paddingRight: 36, appearance: "none" }}
                  >
                    <option value="">No category</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <LuFolder size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
                </div>
                <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>Helps customers find products in your storefront.</p>
              </div>
            </div>
          </div>

          <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Options</span>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={form.is_featured} onChange={e => set("is_featured", e.target.checked)} style={{ accentColor: "var(--brand-solid)", width: 16, height: 16 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Featured product</p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>Show in featured section</p>
                </div>
              </label>
            </div>
          </div>

        </div>
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 10, background: "var(--surface-900)", borderTop: "1px solid var(--border)", padding: "12px 24px", display: "flex", justifyContent: "flex-end", gap: 10 }} className="mobile-action-bar">
        <button className="btn btn-secondary" onClick={() => handleSave("draft")} disabled={isPending}>
          {isPending ? <LuLoader size={14} className="spin" /> : <LuSave size={14} />} Save
        </button>
        <button className="btn btn-primary" onClick={() => handleSave("active")} disabled={isPending}>
          {isPending ? <LuLoader size={14} className="spin" /> : <LuEye size={14} />} Publish
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
