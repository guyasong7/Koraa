"use client";
import PageTitle from "@/components/PageTitle";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth";
import { storeApi, Store, StoreCreateData } from "@/lib/api";
import { storefrontHost, storefrontUrl } from "@/lib/rootDomain";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  LuPlus, LuGlobe, LuZap, LuWifiOff, LuLoader,
  LuStore, LuBriefcase, LuUser, LuCheck, LuCircle, LuSettings, LuTriangleAlert,
  LuShirt, LuUtensilsCrossed, LuLaptop, LuFlower, LuHammer, LuGraduationCap, LuUsers, LuTrash2
} from "react-icons/lu";
import { FiEdit2 as LuEdit2 } from "react-icons/fi";

type BizCategory = {
  id: string; label: string; taglinePlaceholder: string;
  namePlaceholder: string; color: string; bg: string; icon: React.ElementType;
};

const BIZ_CATEGORIES: BizCategory[] = [
  { id: "fashion",  label: "Fashion & Apparel",    color: "#ec4899", bg: "rgba(236,72,153,0.08)",  icon: LuShirt,            taglinePlaceholder: "Style that speaks Africa", namePlaceholder: "e.g. Ama Fashion House" },
  { id: "food",     label: "Food & Drinks",         color: "#f97316", bg: "rgba(249,115,22,0.08)",  icon: LuUtensilsCrossed,  taglinePlaceholder: "Fresh flavours, delivered fast", namePlaceholder: "e.g. Mama Chop Kitchen" },
  { id: "tech",     label: "Tech & Electronics",    color: "#3b82f6", bg: "rgba(59,130,246,0.08)",  icon: LuLaptop,           taglinePlaceholder: "The best tech at your fingertips", namePlaceholder: "e.g. NaijaTech Store" },
  { id: "beauty",   label: "Beauty & Wellness",     color: "#a855f7", bg: "rgba(168,85,247,0.08)",  icon: LuFlower,           taglinePlaceholder: "Glow up with us", namePlaceholder: "e.g. Glowskin Cosmetics" },
  { id: "crafts",   label: "Handmade & Crafts",     color: "#22c55e", bg: "rgba(34,197,94,0.08)",   icon: LuHammer,           taglinePlaceholder: "Handcrafted with love", namePlaceholder: "e.g. Kente Craft Co." },
  { id: "education",label: "Education & Courses",   color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  icon: LuGraduationCap,    taglinePlaceholder: "Learn, grow, succeed", namePlaceholder: "e.g. AfriLearn Hub" },
  { id: "other",    label: "Other / General",       color: "#64748b", bg: "rgba(100,116,139,0.08)", icon: LuStore,            taglinePlaceholder: "Your one-stop shop", namePlaceholder: "e.g. My Online Store" },
];

const STATUS = {
  draft:     { label: "Draft",     color: "#64748b", bg: "rgba(100,116,139,0.12)" },
  preview:   { label: "Preview",   color: "#f59e0b", bg: "rgba(245,158,11,0.12)"  },
  published: { label: "Live",      color: "#22c55e", bg: "rgba(34,197,94,0.12)"   },
  suspended: { label: "Suspended", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

function StoreCard({ store, onPublish, onUnpublish, onDelete }: {
  store: Store; onPublish: (id: string) => void; onUnpublish: (id: string) => void; onDelete: (store: Store) => void;
}) {
  const s = STATUS[store.status as keyof typeof STATUS] ?? STATUS.draft;
  // Stores shared through a team invite sit in this same list. is_owner is
  // absent on older API responses, so only an explicit false means shared.
  const isShared = store.is_owner === false;
  const roleLabel = store.access_role
    ? store.access_role.charAt(0).toUpperCase() + store.access_role.slice(1)
    : "Team member";

  return (
    <div style={{
      background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: "16px",
      padding: "24px", display: "flex", flexDirection: "column", gap: 20,
      transition: "box-shadow .2s, transform .2s",
      ...(isShared ? { borderTop: "4px solid var(--brand-500)" } : null),
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 32px rgba(0,0,0,0.08)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        {/* Avatar */}
        <div style={{
          width: 64, height: 64, borderRadius: "12px", flexShrink: 0,
          background: "var(--surface-700)",
          border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden"
        }}>
          {store.logo
            ? <img src={store.logo} alt={store.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <LuGlobe size={28} color="var(--brand-500)" />}
        </div>
        
        {/* Status Badge */}
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ padding: "4px 12px", borderRadius: "9999px", fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.03em", textTransform: "uppercase" }}>
            {store.status === "published" && <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />}
            {s.label}
          </span>
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px 0", fontFamily: "Outfit, sans-serif", letterSpacing: "-0.02em" }}>{store.name}</h3>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <span>{storefrontHost(store.slug)}</span>
          {store.status === "published" && (
            <a href={store.storefront_url || storefrontUrl(store.slug)} target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--brand-500)", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
              ↗ Visit
            </a>
          )}
        </p>
        
        {isShared && (
          <div style={{ marginTop: 12 }}>
            <span
              title={`${store.shared_by || "Another merchant"} shared this store with you`}
              style={{ padding: "4px 10px", borderRadius: "8px", fontSize: 12, fontWeight: 600, background: "var(--brand-tint)", color: "var(--brand-text)", display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <LuUsers size={12} /> Shared &middot; {roleLabel} {store.shared_by && `by ${store.shared_by}`}
            </span>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 16, borderTop: "1px solid var(--border)", marginTop: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Currency</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{store.currency}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Created</span>
          <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>
            {new Date(store.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexShrink: 0, marginTop: 8 }}>
        <Link href={`/dashboard/stores/${store.id}`} className="btn btn-secondary" style={{ flex: 1, fontSize: 14, padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: "10px" }}>
          <LuSettings size={15} /> Manage
        </Link>
        {store.status !== "published" ? (
          <button onClick={() => onPublish(store.id)} className="btn btn-primary" style={{ flex: 1, fontSize: 14, padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: "10px" }}>
            <LuZap size={15} fill="white" /> Publish
          </button>
        ) : (
          <button onClick={() => onUnpublish(store.id)} className="btn btn-secondary" style={{ flex: 1, fontSize: 14, padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: "10px" }}>
            <LuWifiOff size={15} /> Unpublish
          </button>
        )}
        {!isShared && (
          <button onClick={() => onDelete(store)} className="btn btn-secondary" style={{ padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "10px", color: "#ef4444", borderColor: "transparent", background: "rgba(239,68,68,0.1)" }} title="Delete store">
            <LuTrash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Create Store Modal ──────────────────────────────────────────────────────────
type FormData = {
  name: string; tagline: string; currency: string; country: string; language: string; is_registered: boolean;
};

function CreateStoreModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [category, setCategory] = useState<BizCategory | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormData>({
    name: "", tagline: "", currency: "XAF", country: "CM", language: "en", is_registered: false,
  });
  const [slugPreview, setSlugPreview] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const slug = form.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
    setSlugPreview(slug);
  }, [form.name]);

  useEffect(() => {
    if (step === 2) setTimeout(() => nameRef.current?.focus(), 100);
  }, [step]);

  const createMutation = useMutation({
    mutationFn: (data: Omit<FormData, "is_registered">) =>
      storeApi.create(data as StoreCreateData).then(r => r.data),
    onSuccess: (store) => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      toast.success(`🎉 "${store.name}" created successfully!`);
      onClose();
    },
    onError: (err: any) => {
      const data = err?.response?.data;
      if (data && typeof data === "object") {
        const errs: Record<string, string> = {};
        Object.entries(data).forEach(([k, v]) => { errs[k] = Array.isArray(v) ? v[0] : String(v); });
        setErrors(errs);
      } else {
        toast.error(err?.response?.data?.detail || "Failed to create store.");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (!form.name.trim()) { setErrors({ name: "Store name is required." }); return; }
    const { is_registered, ...payload } = form;
    createMutation.mutate(payload as Omit<FormData, "is_registered">);
  };

  const accent = category?.color || "var(--brand-500)";
  const accentBg = category?.bg || "var(--brand-tint)";

  return (
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Step 1's category grid is the widest content, so it gets the
          wider ceiling; step 2 is two text fields and looks lost in it. */}
      <div className="modal-panel" style={{ maxWidth: step === 1 ? 560 : 480 }}>

        {/* Header.
            The subtitle and step dots used to be indented 48px to clear
            the icon above them. That reserved a sixth of the panel width
            for nothing and pushed the copy into a narrow column, so they
            sit flush and the header keeps its own padding instead. */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, borderRadius: 0, background: accentBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.2s" }}>
              {category ? <category.icon size={18} color={accent} /> : <LuStore size={18} color="var(--brand-500)" />}
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, fontFamily: "var(--font-display)" }}>
              {step === 1 ? "What type of store?" : `Set up your ${category?.label || ""} store`}
            </h2>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            {step === 1 ? "Pick your industry — we'll tailor the experience for you." : "Fill in a few details to get started."}
          </p>
          {/* Step dots */}
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            {[1, 2].map(n => (
              <div key={n} style={{ width: n === step ? 20 : 8, height: 8, borderRadius: 4, background: step >= n ? accent : "var(--border)", transition: "all 0.3s" }} />
            ))}
          </div>
        </div>

        {step === 1 ? (
          <>
            <div className="modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {BIZ_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.id} type="button"
                      onClick={() => { setCategory(cat); setStep(2); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                        background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 0,
                        cursor: "pointer", textAlign: "left", transition: "all .15s", minHeight: 52,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = cat.color; (e.currentTarget as HTMLElement).style.background = cat.bg; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.background = "var(--surface)"; }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: 0, background: cat.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon size={17} color={cat.color} />
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={onClose} style={{ width: "100%", minHeight: 46, padding: "12px", background: "none", border: "1.5px solid var(--border)", borderRadius: 0, cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Category badge */}
              {category && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: accentBg, border: `1px solid ${accent}30`, fontSize: 14, fontWeight: 600, color: accent }}>
                  <category.icon size={15} /> {category.label}
                  <button type="button" onClick={() => setStep(1)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: accent, fontWeight: 600 }}>Change ›</button>
                </div>
              )}

              {/* Store name */}
              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Store name <span style={{ color: "var(--danger-text)" }}>*</span>
                </label>
                <input ref={nameRef} type="text" className="input"
                  placeholder={category?.namePlaceholder || "e.g. My Online Store"}
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  style={{ width: "100%", padding: "11px 14px", fontSize: 15, borderColor: errors.name ? "var(--danger)" : undefined, borderRadius: 0 }}
                />
                {errors.name && <p style={{ fontSize: 13, color: "var(--danger-text)", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}><LuTriangleAlert size={13} /> {errors.name}</p>}
                {slugPreview && !errors.name && (
                  <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
                    🔗 <strong style={{ color: accent }}>{storefrontHost(slugPreview)}</strong>
                  </p>
                )}
              </div>

              {/* Tagline */}
              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Tagline <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span>
                </label>
                <input type="text" className="input"
                  placeholder={category?.taglinePlaceholder || "Describe your store in one line"}
                  value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })}
                  style={{ width: "100%", padding: "11px 14px", fontSize: 15, borderRadius: 0 }}
                />
              </div>

              {errors.non_field_errors && <div style={{ padding: "10px 14px", background: "color-mix(in srgb, var(--danger) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)", fontSize: 14, color: "var(--danger-text)", display: "flex", alignItems: "center", gap: 8 }}><LuTriangleAlert size={15} /> {errors.non_field_errors}</div>}
              {errors.detail && <div style={{ padding: "10px 14px", background: "color-mix(in srgb, var(--danger) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)", fontSize: 14, color: "var(--danger-text)", display: "flex", alignItems: "center", gap: 8 }}><LuTriangleAlert size={15} /> {errors.detail}</div>}
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setStep(1)} style={{ flex: 1, minHeight: 46, padding: "12px", background: "none", border: "1.5px solid var(--border)", borderRadius: 0, cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>← Back</button>
              <button type="submit" disabled={createMutation.isPending || !form.name.trim()}
                style={{
                  flex: 2, minHeight: 46, padding: "12px", border: "none", borderRadius: 0,
                  cursor: createMutation.isPending || !form.name.trim() ? "not-allowed" : "pointer",
                  fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: !form.name.trim() ? "var(--surface-700)" : accent,
                  color: !form.name.trim() ? "var(--text-muted)" : "#fff",
                  opacity: createMutation.isPending ? 0.8 : 1, transition: "all .15s",
                }}
              >
                {createMutation.isPending ? <><LuLoader size={17} className="spin" /> Creating…</> : <><LuCheck size={17} /> Create store</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}


function DeleteStoreModal({ store, onClose }: { store: Store; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [confirmName, setConfirmName] = useState("");
  
  const deleteMutation = useMutation({
    mutationFn: (id: string) => storeApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      toast.success(`Store "${store.name}" has been deleted.`);
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to delete store.");
    }
  });

  const isMatch = confirmName === store.name;

  return (
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Rounded, unlike the create dialog — kept as it was rather than
          squared off to match, since the radius is not what needed
          fixing here. */}
      <div className="modal-panel" style={{ maxWidth: 440, borderRadius: "16px" }}>
        <div className="modal-body" style={{ padding: "22px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger-text)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <LuTrash2 size={24} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 10px 0", fontFamily: "var(--font-display)" }}>
            Delete store?
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 15, margin: "0 0 18px 0", lineHeight: 1.55 }}>
            This action cannot be undone. All products, orders, and customer data associated with <strong style={{ color: "var(--text-primary)" }}>{store.name}</strong> will be permanently removed.
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
          <button onClick={onClose} className="btn btn-secondary" style={{ flex: 1, minHeight: 46, padding: "12px", fontSize: 15, borderRadius: "8px", justifyContent: "center" }}>
            Cancel
          </button>
          <button
            onClick={() => deleteMutation.mutate(store.id)}
            disabled={!isMatch || deleteMutation.isPending}
            className="btn btn-primary"
            style={{
              flex: 1, minHeight: 46, padding: "12px", fontSize: 15, borderRadius: "8px", justifyContent: "center",
              background: !isMatch ? "var(--surface-700)" : "var(--danger)",
              color: !isMatch ? "var(--text-muted)" : "#fff",
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
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function StoresPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<Store | null>(null);

  useEffect(() => {
    if (!isAuthenticated) router.replace("/auth/login");
  }, [isAuthenticated, router]);

  const { data: storesData, isLoading } = useQuery({
    queryKey: ["stores"],
    queryFn: () => storeApi.list().then(r => r.data),
    enabled: isAuthenticated,
  });

  const stores: Store[] = storesData?.results ?? storesData ?? [];

  const publishMutation = useMutation({
    mutationFn: (id: string) => storeApi.publish(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["stores"] }); toast.success("Store is now live! 🎉"); },
    onError: () => toast.error("Failed to publish store."),
  });

  const unpublishMutation = useMutation({
    mutationFn: (id: string) => storeApi.unpublish(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["stores"] }); toast.success("Store taken offline."); },
  });

  return (
    <>
      {/* The `<meta name="description">` that used to sit beside this went with
          the `<Head>`. It never reached the document either, and nothing would
          have read it if it had: this route is behind auth, so no crawler ever
          sees it and no link preview is ever generated from it. */}
      <PageTitle title="Stores — Koraa Dashboard" />

      <div style={{ padding: "32px", maxWidth: 960, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 6, fontFamily: "Outfit, sans-serif", letterSpacing: "-0.02em" }}>
              Your Stores
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
              {stores.length} store{stores.length !== 1 ? "s" : ""} &middot; {stores.filter(s => s.status === "published").length} live
            </p>
          </div>
          {user?.merchant_is_verified ? (
            <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ fontSize: 14, padding: "11px 20px", display: "flex", alignItems: "center", gap: 8 }}>
              <LuPlus size={16} /> New store
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13, color: "#f59e0b", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <LuTriangleAlert size={14} /> ID Verification Required
              </span>
              <Link href="/dashboard/settings?tab=identity" className="btn btn-secondary" style={{ fontSize: 13, padding: "8px 16px" }}>
                Verify Identity →
              </Link>
            </div>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "40vh", gap: 16 }}>
            <LuLoader size={36} className="spin" color="var(--brand-500)" />
            <p style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Loading stores…</p>
          </div>
        ) : stores.length === 0 ? (
          <div style={{ background: "var(--surface-900)", border: "2px dashed var(--border)", borderRadius: 0, padding: "80px 32px", textAlign: "center" }}>
            <div style={{ width: 72, height: 72, borderRadius: 0, background: "rgba(168,85,247,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
              <LuStore size={32} color="var(--brand-500)" />
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10, fontFamily: "Outfit, sans-serif" }}>No stores yet</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: 15, maxWidth: 420, margin: "0 auto 28px", lineHeight: 1.6 }}>
              Create your first store and start selling to customers across Africa.
            </p>
            {user?.merchant_is_verified ? (
              <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ fontSize: 15, padding: "12px 28px" }}>
                <LuPlus size={17} /> Create your first store
              </button>
            ) : (
              <div style={{ display: "inline-flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                <div style={{ padding: "12px 16px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, color: "#d97706", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  <LuTriangleAlert size={18} /> You must verify your business identity before creating a store.
                </div>
                <Link href="/dashboard/settings?tab=identity" className="btn btn-primary" style={{ fontSize: 15, padding: "12px 28px" }}>
                  Verify Identity
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
            {stores.map(store => (
              <StoreCard
                key={store.id}
                store={store}
                onPublish={id => publishMutation.mutate(id)}
                onUnpublish={id => unpublishMutation.mutate(id)}
                onDelete={setStoreToDelete}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && <CreateStoreModal onClose={() => setShowModal(false)} />}
      {storeToDelete && <DeleteStoreModal store={storeToDelete} onClose={() => setStoreToDelete(null)} />}
    </>
  );
}
