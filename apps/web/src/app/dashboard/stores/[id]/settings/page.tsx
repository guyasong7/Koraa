"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { storefrontApi, storeApi, StorefrontConfig, StorefrontSection, Store } from "@/lib/api";
import {
  LuSave, LuGlobe, LuEye, LuMonitor, LuSmartphone, LuTablet, LuUpload, LuCheck,
  LuChevronRight, LuPalette, LuType, LuMegaphone, LuImage, LuFolder, LuStar,
  LuShoppingBag, LuGift, LuInfo, LuMail, LuLink, LuPackage, LuSparkles,
  LuLayoutTemplate
} from "react-icons/lu";
// Labels only — importing from the registry would pull all six layout modules
// into the dashboard bundle.
import { LAYOUT_CHOICES } from "@/components/storefront/layoutMeta";

// ─── Schema: all sections + their editable fields ─────────────────────────────
const SECTIONS_SCHEMA: Record<string, { label: string; icon: React.ElementType; fields: { key: string; label: string; type: "text"|"textarea"|"url"|"toggle"|"color"|"image" }[] }> = {
  announcement_bar: {
    label: "Announcement Bar", icon: LuMegaphone,
    fields: [
      { key: "text",       label: "Message",          type: "text"   },
      { key: "bg_color",   label: "Background Colour", type: "color"  },
      { key: "text_color", label: "Text Colour",       type: "color"  },
    ],
  },
  hero: {
    label: "Hero Banner", icon: LuImage,
    fields: [
      { key: "title",       label: "Headline",          type: "text"     },
      { key: "subtitle",    label: "Subheadline",        type: "textarea" },
      { key: "button_text", label: "Button Text",        type: "text"     },
      { key: "image",       label: "Background Image",   type: "image"    },
      { key: "overlay",     label: "Dark Overlay",       type: "toggle"   },
    ],
  },
  categories: {
    label: "Categories", icon: LuFolder,
    fields: [
      { key: "title",    label: "Section Title", type: "text"   },
      { key: "show_all", label: "Show All Button", type: "toggle" },
    ],
  },
  featured_products: {
    label: "Featured Products", icon: LuStar,
    fields: [
      { key: "title", label: "Section Title", type: "text" },
    ],
  },
  catalog: {
    label: "Product Catalog", icon: LuShoppingBag,
    fields: [
      { key: "title",        label: "Section Title",        type: "text"   },
      { key: "show_sidebar", label: "Show Category Sidebar", type: "toggle" },
    ],
  },
  promo_banner: {
    label: "Promo Banner", icon: LuGift,
    fields: [
      { key: "title",       label: "Headline",    type: "text"    },
      { key: "subtitle",    label: "Subheadline", type: "textarea"},
      { key: "button_text", label: "Button Text", type: "text"    },
      { key: "button_url",  label: "Button URL",  type: "url"     },
      { key: "image",       label: "Banner Image",type: "image"   },
    ],
  },
  about: {
    label: "About Us", icon: LuInfo,
    fields: [
      { key: "title",   label: "Title",   type: "text"     },
      { key: "content", label: "Content", type: "textarea" },
      { key: "image",   label: "Image",   type: "image"    },
    ],
  },
  newsletter: {
    label: "Newsletter", icon: LuMail,
    fields: [
      { key: "title",       label: "Headline",    type: "text"     },
      { key: "subtitle",    label: "Subheadline", type: "textarea" },
      { key: "placeholder", label: "Input Placeholder", type: "text" },
      { key: "button_text", label: "Button Text", type: "text"     },
    ],
  },
  contact_form: {
    label: "Enquiry Form", icon: LuMail,
    fields: [
      { key: "title",    label: "Headline",    type: "text"     },
      { key: "subtitle", label: "Subheadline", type: "textarea" },
    ],
  },
  footer: {
    label: "Footer", icon: LuLink,
    fields: [
      { key: "tagline", label: "Tagline", type: "textarea" },
    ],
  },
};

// ─── ImageUpload helper ────────────────────────────────────────────────────────
function ImageUploadField({ value, sectionId, storeId, onUploaded }: { value: string; sectionId: string; storeId: string; onUploaded: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await storefrontApi.uploadSectionImage(storeId, sectionId, file);
      onUploaded(res.data.url);
    } catch { alert("Image upload failed."); }
    finally { setUploading(false); }
  };

  return (
    <div>
      {value && (
        <img src={value} alt="" style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 0, marginBottom: 8 }} />
      )}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "var(--surface-900)", border: "1.5px dashed var(--border)", borderRadius: 0, cursor: "pointer", fontSize: 13, color: "var(--text-secondary)", width: "100%" }}
      >
        <LuUpload size={14} /> {uploading ? "Uploading…" : "Upload from PC"}
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
    </div>
  );
}

// ─── StoreAsset upload (logo / favicon) ───────────────────────────────────────
function AssetUpload({ label, current, field, storeId, onUploaded }: { label: string; current?: string; field: "logo"|"favicon"; storeId: string; onUploaded: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await storefrontApi.uploadStoreAssets(storeId, { [field]: file });
      onUploaded(res.data[field] || "");
    } catch { alert("Upload failed."); }
    finally { setUploading(false); }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{label}</p>
      {current && (
        <img src={current} alt={label} style={{ height: 48, borderRadius: 0, marginBottom: 8, objectFit: "contain", background: "var(--surface-900)", padding: 4 }} />
      )}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", background: "var(--surface-900)", border: "1.5px dashed var(--border)", borderRadius: 0, cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}
      >
        <LuUpload size={13} /> {uploading ? "Uploading…" : `Upload ${label}`}
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────
export default function StorefrontEditor() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [store, setStore]       = useState<Store | null>(null);
  const [config, setConfig]     = useState<StorefrontConfig | null>(null);
  const [sections, setSections] = useState<StorefrontSection[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const [activeTab, setActiveTab]           = useState<"sections"|"brand"|"store">("sections");
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [previewMode, setPreviewMode]       = useState<"desktop"|"tablet"|"mobile">("desktop");

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // store logo/favicon state
  const [logoUrl, setLogoUrl]     = useState<string>("");
  const [faviconUrl, setFaviconUrl] = useState<string>("");

  // ── fetch ──
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [cfgR, secR, storeR] = await Promise.all([
          storefrontApi.getConfig(id),
          storefrontApi.getSections(id),
          storeApi.get(id),
        ]);
        setConfig(cfgR.data);
        setSections(secR.data?.results ?? secR.data ?? []);
        setStore(storeR.data);
        setLogoUrl(storeR.data.logo || "");
        setFaviconUrl(storeR.data.favicon || "");
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [id]);

  // ── postMessage sync ──
  useEffect(() => {
    if (!iframeRef.current?.contentWindow || !config) return;
    iframeRef.current.contentWindow.postMessage(
      { type: "KORAA_PREVIEW_UPDATE", payload: { config, sections, store } },
      // The preview iframe is served by this same Next app, so our own origin
      // is always the right target. Hardcoding localhost:3000 meant the
      // preview silently stopped updating anywhere but a dev laptop.
      window.location.origin
    );
  }, [config, sections, store]);

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };

  const handleSave = async () => {
    if (!config || !store) return;
    setSaving(true);
    try {
      await storefrontApi.updateConfig(id, config);
      await storeApi.update(id, { name: store.name, tagline: store.tagline });
      for (const s of sections) {
        await storefrontApi.updateSection(id, s.id, { settings: s.settings, enabled: s.enabled, order: s.order });
      }
      flash();
    } catch { alert("Save failed."); }
    finally { setSaving(false); }
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      await handleSave();
      const r = await storefrontApi.publish(id);
      alert(`✅ Live at: ${r.data.storefront_url}`);
    } catch { alert("Publish failed."); }
    finally { setSaving(false); }
  };

  const setSectionSetting = useCallback((sectionId: string, key: string, value: any) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, settings: { ...s.settings, [key]: value } } : s));
  }, []);

  // ── guards ──
  if (loading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-950)" }}>
      <div style={{ textAlign: "center", color: "var(--text-secondary)" }}>Loading editor…</div>
    </div>
  );
  if (!config || !store) return <div style={{ padding: 32 }}>Error loading data.</div>;

  const token = typeof window !== "undefined" ? localStorage.getItem("koraa_access") : "";
  const activeSection = sections.find(s => s.id === activeSectionId);
  const schema = activeSection ? SECTIONS_SCHEMA[activeSection.type] : null;
  const editableSections = sections.filter(s => SECTIONS_SCHEMA[s.type]);


  return (
    <div className="sf-editor-root">

      {/* Topbar */}
      <header className="sf-topbar">
        <div className="sf-topbar-left">
          <button onClick={() => router.push(`/dashboard/stores/${store.id}`)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>← Back</button>
          <div style={{ width: 1, height: 18, background: "var(--border)", flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>Storefront Editor</span>
          <span className="sf-store-badge">{store.name}</span>
        </div>
        <div className="sf-topbar-right">
          {saved && <span style={{ fontSize: 12, color: "#22c55e", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}><LuCheck size={12} /> Saved</span>}
          <button onClick={() => router.push(`/dashboard/stores/${store.id}/blueprint`)} className="btn btn-secondary sf-btn-icon" title="Blueprint"><LuSparkles size={14} /> <span className="sf-btn-label">Blueprint</span></button>
          <button onClick={handleSave} disabled={saving} className="btn btn-secondary sf-btn-icon" title="Save Draft"><LuSave size={14} /> <span className="sf-btn-label">{saving ? "Saving…" : "Save"}</span></button>
          <button onClick={handlePublish} disabled={saving} className="btn btn-primary sf-btn-icon" title="Publish"><LuGlobe size={14} /> <span className="sf-btn-label">Publish</span></button>
          <button className="btn btn-secondary sf-btn-icon" title="View Live" onClick={() => window.open(store.storefront_url, "_blank")}><LuEye size={14} /> <span className="sf-btn-label">Live</span></button>
        </div>
      </header>

      <div className="sf-body">

        {/* Sidebar */}
        <aside className="sf-sidebar">
          {/* Tabs */}
          <div className="sf-tabs">
            <button className={`sf-tab${activeTab === "sections" ? " active" : ""}`} onClick={() => { setActiveTab("sections"); setActiveSectionId(null); }}>Sections</button>
            <button className={`sf-tab${activeTab === "brand" ? " active" : ""}`}    onClick={() => { setActiveTab("brand");    setActiveSectionId(null); }}>Brand</button>
            <button className={`sf-tab${activeTab === "store" ? " active" : ""}`}    onClick={() => { setActiveTab("store");    setActiveSectionId(null); }}>Store</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>

            {/* ── Section detail ─────────────────────────────── */}
            {activeSection && schema ? (
              <div>
                <button onClick={() => setActiveSectionId(null)} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", gap: 4 }}>
                  ← {schema.label}
                </button>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {schema.fields.map(f => (
                    <div key={f.key}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{f.label}</label>
                      {f.type === "image" ? (
                        <ImageUploadField
                          value={activeSection.settings[f.key] || ""}
                          sectionId={activeSection.id}
                          storeId={store.id}
                          onUploaded={url => setSectionSetting(activeSection.id, f.key, url)}
                        />
                      ) : f.type === "toggle" ? (
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <input type="checkbox" checked={!!activeSection.settings[f.key]}
                            onChange={e => setSectionSetting(activeSection.id, f.key, e.target.checked)} />
                          <span style={{ fontSize: 14 }}>{activeSection.settings[f.key] ? "On" : "Off"}</span>
                        </label>
                      ) : f.type === "color" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="color" value={activeSection.settings[f.key] || "#000000"}
                            onChange={e => setSectionSetting(activeSection.id, f.key, e.target.value)}
                            style={{ width: 36, height: 36, borderRadius: 0, border: "1px solid var(--border)", cursor: "pointer", padding: 2 }} />
                          <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-secondary)" }}>{activeSection.settings[f.key]}</span>
                        </div>
                      ) : f.type === "textarea" ? (
                        <textarea rows={3} className="input" style={{ width: "100%", padding: "8px 12px", resize: "vertical", fontFamily: "inherit" }}
                          value={activeSection.settings[f.key] || ""}
                          onChange={e => setSectionSetting(activeSection.id, f.key, e.target.value)} />
                      ) : (
                        <input type={f.type === "url" ? "url" : "text"} className="input" style={{ width: "100%", padding: "8px 12px" }}
                          placeholder={f.type === "url" ? "https://…" : ""}
                          value={activeSection.settings[f.key] || ""}
                          onChange={e => setSectionSetting(activeSection.id, f.key, e.target.value)} />
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ width: "100%", marginTop: 20, padding: "10px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <LuSave size={13} /> {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>

            ) : activeTab === "sections" ? (
              /* ── Section list ─────────────────────────────────── */
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Page Sections</p>
                {editableSections.map(s => {
                  const sc = SECTIONS_SCHEMA[s.type];
                  return (
                    <div key={s.id}
                      onClick={() => setActiveSectionId(s.id)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderRadius: 0, border: "1.5px solid var(--border)", background: "var(--surface-900)", cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 18, display: "flex", alignItems: "center" }}>
                          {sc?.icon ? <sc.icon size={18} /> : <LuPackage size={18} />}
                        </span>
                        <div>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{sc?.label || s.type}</p>
                          <p style={{ margin: 0, fontSize: 11, color: "var(--text-secondary)" }}>{s.enabled ? "Visible" : "Hidden"}</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <label onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={s.enabled}
                            onChange={e => setSections(prev => prev.map(x => x.id === s.id ? { ...x, enabled: e.target.checked } : x))} />
                        </label>
                        <LuChevronRight size={15} color="var(--text-secondary)" />
                      </div>
                    </div>
                  );
                })}
              </div>

            ) : activeTab === "brand" ? (
              /* ── Brand & Theme ───────────────────────────────── */
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Layout comes first: it decides the page's structure, while
                    everything below only changes its surface. */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <LuLayoutTemplate size={13} /> Layout
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {LAYOUT_CHOICES.map(l => {
                      const active = (config.layout ?? "classic") === l.key;
                      return (
                        <button key={l.key}
                          onClick={() => setConfig({ ...config, layout: l.key } as StorefrontConfig)}
                          style={{ textAlign: "left", padding: "10px 12px", cursor: "pointer", border: "1.5px solid", borderColor: active ? "var(--brand-500)" : "var(--border)", background: active ? "rgba(168,85,247,0.08)" : "transparent", borderRadius: 0 }}>
                          <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: active ? "var(--brand-500)" : "var(--text)" }}>{l.label}</span>
                          <span style={{ display: "block", fontSize: 11, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.45 }}>{l.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <LuPalette size={13} /> Colours
                  </p>
                  {[
                    { key: "primary_color",    label: "Primary"    },
                    { key: "accent_color",      label: "Accent"     },
                    { key: "background_color",  label: "Background" },
                    { key: "text_color",        label: "Text"       },
                    { key: "secondary_color",   label: "Secondary"  },
                  ].map(({ key, label }) => (
                    <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <label style={{ fontSize: 13 }}>{label}</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-secondary)" }}>{(config as any)[key]}</span>
                        <input type="color" value={(config as any)[key] || "#000000"}
                          onChange={e => setConfig({ ...config, [key]: e.target.value } as StorefrontConfig)}
                          style={{ width: 32, height: 32, borderRadius: 0, border: "1px solid var(--border)", cursor: "pointer", padding: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <LuType size={13} /> Font
                  </p>
                  <select className="input" value={config.font} onChange={e => setConfig({ ...config, font: e.target.value } as StorefrontConfig)} style={{ width: "100%", padding: "8px 12px" }}>
                    {["Inter","Outfit","Poppins","Lato","Raleway","Nunito"].map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>

                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Button Shape</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["rounded","pill","square"].map(bs => (
                      <button key={bs} onClick={() => setConfig({ ...config, button_style: bs } as StorefrontConfig)}
                        style={{ flex: 1, padding: "8px 4px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1.5px solid", borderColor: config.button_style === bs ? "var(--brand-500)" : "var(--border)", color: config.button_style === bs ? "var(--brand-500)" : "var(--text-secondary)", background: config.button_style === bs ? "rgba(168,85,247,0.08)" : "transparent", borderRadius: bs === "rounded" ? 8 : bs === "pill" ? 9999 : 0, textTransform: "capitalize" }}>
                        {bs}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ padding: "10px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <LuSave size={13} /> {saving ? "Saving…" : "Save Brand"}
                </button>
              </div>

            ) : (
              /* ── Store assets ─────────────────────────────────── */
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Store Identity</p>
                
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Store Name</label>
                  <input type="text" className="input" value={store.name} onChange={e => setStore({...store, name: e.target.value})} style={{ width: "100%", padding: "10px 14px", borderRadius: 0 }} />
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Tagline</label>
                  <input type="text" className="input" value={store.tagline || ""} onChange={e => setStore({...store, tagline: e.target.value})} style={{ width: "100%", padding: "10px 14px", borderRadius: 0 }} />
                </div>

                <AssetUpload label="Logo" current={logoUrl} field="logo" storeId={store.id} onUploaded={url => setLogoUrl(url)} />
                <AssetUpload label="Favicon" current={faviconUrl} field="favicon" storeId={store.id} onUploaded={url => setFaviconUrl(url)} />
                <div style={{ marginTop: 8, padding: 12, background: "var(--surface-900)", borderRadius: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                  💡 Uploads save immediately to the server. Refresh the preview to see logo changes.
                </div>

                <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ padding: "10px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12 }}>
                  <LuSave size={13} /> {saving ? "Saving…" : "Save Store Info"}
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Preview */}
        <main className="sf-preview">
          {/* Device switcher */}
          <div style={{ background: "var(--surface)", borderRadius: 20, border: "1px solid var(--border)", padding: 4, display: "flex", gap: 2, marginBottom: 16, flexShrink: 0 }}>
            {([["desktop", LuMonitor], ["tablet", LuTablet], ["mobile", LuSmartphone]] as const).map(([mode, Icon]) => (
              <button key={mode} onClick={() => setPreviewMode(mode)}
                style={{ padding: "7px 10px", borderRadius: 16, border: "none", cursor: "pointer", background: previewMode === mode ? "rgba(168,85,247,0.12)" : "transparent", color: previewMode === mode ? "var(--brand-500)" : "var(--text-secondary)", transition: "all .15s" }}>
                <Icon size={16} />
              </button>
            ))}
          </div>

          {/* Iframe */}
          <div style={{ transition: "width 0.3s ease", background: "var(--surface-900)", boxShadow: "0 20px 40px rgba(0,0,0,0.15)", borderRadius: "14px 14px 0 0", overflow: "hidden", border: "1px solid var(--border)", borderBottom: "none", width: previewMode === "desktop" ? "100%" : previewMode === "tablet" ? "min(768px, 100%)" : "min(390px, 100%)", height: "100%", maxHeight: "100%" }}>
            <iframe ref={iframeRef}
              src={`/store/preview/${store.id}?token=${token}`}
              style={{ width: "100%", height: "100%", border: "none" }}
              title="Storefront Preview"
              onLoad={() => iframeRef.current?.contentWindow?.postMessage({ type: "KORAA_PREVIEW_UPDATE", payload: { config, sections, store } }, window.location.origin)} />
          </div>
        </main>
      </div>

      <style>{`
        /* ── Root layout ── */
        .sf-editor-root {
          display: flex;
          flex-direction: column;
          height: 100dvh;
          background: var(--surface-950);
          overflow: hidden;
        }

        /* ── Topbar ── */
        .sf-topbar {
          height: auto;
          min-height: 54px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          padding: 8px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-shrink: 0;
          flex-wrap: wrap;
        }
        .sf-topbar-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          overflow: hidden;
        }
        .sf-store-badge {
          font-size: 11px;
          background: rgba(168,85,247,0.1);
          color: var(--brand-500);
          padding: 2px 9px;
          border-radius: 20px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 140px;
        }
        .sf-topbar-right {
          display: flex;
          gap: 6px;
          align-items: center;
          flex-shrink: 0;
          flex-wrap: wrap;
        }
        .sf-btn-icon {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 7px 11px;
          font-size: 13px;
        }

        /* ── Body ── */
        .sf-body {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        /* ── Sidebar ── */
        .sf-sidebar {
          width: 300px;
          background: var(--surface);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          flex-shrink: 0;
        }

        /* ── Tabs ── */
        .sf-tabs {
          display: flex;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .sf-tab {
          flex: 1;
          padding: 13px 4px;
          font-size: 12px;
          font-weight: 600;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-secondary);
          cursor: pointer;
          transition: color .15s, border-color .15s;
        }
        .sf-tab.active {
          border-bottom-color: var(--brand-500);
          color: var(--brand-500);
        }

        /* ── Preview ── */
        .sf-preview {
          flex: 1;
          background: var(--surface-950);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px 16px 0;
          overflow: hidden;
        }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .sf-topbar {
            padding: 8px 12px;
          }
          .sf-btn-label {
            display: none;
          }
          .sf-btn-icon {
            padding: 8px;
          }
          .sf-store-badge {
            max-width: 90px;
          }
          .sf-body {
            flex-direction: column;
          }
          .sf-sidebar {
            width: 100%;
            border-right: none;
            border-bottom: 1px solid var(--border);
            /* On mobile, cap the sidebar at 50vh so users can still scroll down to see the preview hint */
            max-height: 55dvh;
          }
          .sf-preview {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
