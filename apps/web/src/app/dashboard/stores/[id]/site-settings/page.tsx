"use client";

/**
 * Site settings — thirteen panels of shop-wide preferences.
 *
 * Rendered from the schema the API returns rather than from a form written here:
 * `backend/apps/stores/site_settings.py` declares every panel, every field, its
 * kind, its choices and its help text, and this page draws whatever it is given.
 * Thirteen bespoke forms would restate forty choice lists in TypeScript and
 * drift from the backend within a release.
 *
 * Three panels need more than a field renderer can draw — a favicon upload, a
 * sharing-image upload, and the catalogue CSV tool — so those are matched on
 * `panel.component` and handled below. Everything else is generic.
 *
 * Fields come from two places. Most live in the store's `site_settings` JSON and
 * are saved through the site-settings endpoint; a few (the social links, the two
 * images) are real columns on the store and go through the store endpoint. Each
 * field declares which, and Save sends whichever of the two has changes.
 */

import PageTitle from "@/components/PageTitle";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LuArrowLeft,
  LuBot,
  LuCircleCheck,
  LuClock,
  LuCookie,
  LuDownload,
  LuFileSpreadsheet,
  LuGlobe,
  LuImage,
  LuImages,
  LuLanguages,
  LuLink,
  LuLoader,
  LuLock,
  LuMegaphone,
  LuPin,
  LuRss,
  LuSave,
  LuShare2,
  LuTriangleAlert,
  LuUpload,
} from "react-icons/lu";
import toast from "react-hot-toast";

import { productApi, storeApi, storefrontApi } from "@/lib/api";
import type {
  ImportReport,
  SettingField,
  SettingPanel,
  SettingValue,
  SiteSettingsResponse,
  StoreUpdateData,
} from "@/lib/api";

const PANEL_ICONS: Record<string, typeof LuGlobe> = {
  availability: LuLock,
  languages: LuLanguages,
  regional: LuClock,
  privacy: LuCookie,
  favicon: LuImage,
  social_links: LuLink,
  social_sharing: LuShare2,
  pinterest: LuPin,
  import_export: LuFileSpreadsheet,
  blog: LuRss,
  promotion: LuMegaphone,
  crawlers: LuBot,
  images: LuImages,
};

type Draft = Record<string, SettingValue>;

export default function SiteSettingsPage() {
  const id = useParams().id as string;

  const { data, isLoading, refetch } = useQuery<SiteSettingsResponse>({
    queryKey: ["site-settings", id],
    queryFn: () => storeApi.siteSettings(id).then(r => r.data),
    enabled: !!id,
  });

  const [active, setActive] = useState<string>("");
  const [settingsDraft, setSettingsDraft] = useState<Draft>({});
  const [storeDraft, setStoreDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && !active) setActive(data.panels[0]?.key ?? "");
  }, [data, active]);

  const panel = useMemo(
    () => data?.panels.find(p => p.key === active) ?? data?.panels[0],
    [data, active],
  );

  /** The value a field currently shows: the draft if edited, else the saved one. */
  const valueOf = useCallback(
    (field: SettingField): SettingValue => {
      const draft = field.source === "store" ? storeDraft : settingsDraft;
      if (field.key in draft) return draft[field.key];
      if (field.source === "store") {
        return (data?.store as unknown as Draft)?.[field.key] ?? "";
      }
      return data?.values[field.key] ?? "";
    },
    [data, settingsDraft, storeDraft],
  );

  const setValue = useCallback((field: SettingField, value: SettingValue) => {
    const setter = field.source === "store" ? setStoreDraft : setSettingsDraft;
    setter(previous => ({ ...previous, [field.key]: value }));
  }, []);

  const dirty = Object.keys(settingsDraft).length > 0 || Object.keys(storeDraft).length > 0;

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      if (Object.keys(storeDraft).length > 0) {
        await storeApi.update(id, storeDraft as unknown as Partial<StoreUpdateData>);
      }
      if (Object.keys(settingsDraft).length > 0) {
        // A blank passcode means "leave it alone", not "clear it" — the field
        // renders empty because the real value is never sent to the browser, so
        // saving an untouched panel would otherwise wipe the gate.
        const payload = { ...settingsDraft };
        if (payload.access_password === "") delete payload.access_password;
        await storeApi.updateSiteSettings(id, payload);
      }
      setSettingsDraft({});
      setStoreDraft({});
      await refetch();
      toast.success("Settings saved.");
    } catch {
      toast.error("Could not save those settings.");
    } finally {
      setSaving(false);
    }
  };

  /** Hidden while the field it depends on says otherwise. */
  const visible = (field: SettingField, fields: SettingField[]) => {
    if (!field.depends_on) return true;
    const parent = fields.find(f => f.key === field.depends_on!.key);
    if (!parent) return true;
    return valueOf(parent) === field.depends_on.value;
  };

  return (
    <>
      <PageTitle title={`Site settings — ${data?.store.name ?? "Store"} — Koraa`} />

      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <Link href={`/dashboard/stores/${id}`} style={backLink}>
          <LuArrowLeft size={15} /> Back to store
        </Link>

        <div style={headerRow}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.02em" }}>
              Site settings
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
              Who can see {data?.store.name ?? "this shop"}, what it declares about itself, and how
              it handles images and crawlers.
            </p>
          </div>
          <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
            {saving ? <LuLoader size={16} className="spin" /> : <LuSave size={16} />}
            {dirty ? "Save changes" : "Saved"}
          </button>
        </div>

        {isLoading || !data || !panel ? (
          <div style={loadingBox}>
            <LuLoader size={30} className="spin" color="var(--brand-500)" />
          </div>
        ) : (
          <div className="site-settings-grid">
            <nav className="card" style={{ padding: 8, alignSelf: "start" }} aria-label="Settings sections">
              {data.panels.map(p => {
                const Icon = PANEL_ICONS[p.key] ?? LuGlobe;
                const on = p.key === active;
                return (
                  <button
                    key={p.key}
                    onClick={() => setActive(p.key)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      background: on ? "var(--surface-850)" : "none",
                      border: "none",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      textAlign: "left",
                      color: on ? "var(--text-primary)" : "var(--text-secondary)",
                      fontSize: 14,
                      fontWeight: on ? 600 : 500,
                    }}
                    aria-current={on ? "true" : undefined}
                  >
                    <Icon size={16} color={on ? "var(--brand-500)" : "var(--text-muted)"} />
                    <span style={{ flex: 1, minWidth: 0 }}>{p.title}</span>
                  </button>
                );
              })}
            </nav>

            <section className="card">
              <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 5 }}>{panel.title}</h2>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 26 }}>
                {panel.blurb}
              </p>

              {panel.component === "import_export" ? (
                <ImportExport storeId={id} />
              ) : (
                <>
                  {panel.fields
                    .filter(field => visible(field, panel.fields))
                    .map(field =>
                      field.kind === "image" ? (
                        <AssetField
                          key={field.key}
                          storeId={id}
                          field={field}
                          current={
                            field.key === "favicon" ? data.store.favicon : data.store.social_image
                          }
                          onUploaded={() => refetch()}
                        />
                      ) : (
                        <FieldRow
                          key={field.key}
                          field={field}
                          value={valueOf(field)}
                          hasPassword={data.has_access_password}
                          onChange={next => setValue(field, next)}
                        />
                      ),
                    )}
                  <PanelNote panel={panel} />
                </>
              )}
            </section>
          </div>
        )}
      </div>

      <style jsx>{`
        .site-settings-grid {
          display: grid;
          grid-template-columns: 246px 1fr;
          gap: 20px;
          align-items: start;
          padding-bottom: 40px;
        }
        @media (max-width: 860px) {
          .site-settings-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}

/** Caveats that belong to a whole panel rather than to one of its fields. */
function PanelNote({ panel }: { panel: SettingPanel }) {
  const notes: Record<string, string> = {
    blog:
      "Nothing publishes yet. The posts, the episode list and the feed itself are not built — " +
      "these preferences are stored so they are already right when they are.",
    languages:
      "Koraa does not translate your shop. Declaring a language tells search engines what you " +
      "have written; writing it is still yours to do.",
    crawlers:
      "This is written into your robots.txt. Well-behaved crawlers obey it and badly-behaved " +
      "ones ignore it, so it is a request rather than a lock.",
    images:
      "Loading, cropping and click-to-zoom are applied to your storefront. Compression is not " +
      "yet — your photographs are served as you uploaded them — so upload them already sized " +
      "for the web rather than straight off a camera.",
  };
  const note = notes[panel.key];
  if (!note) return null;

  return (
    <p
      style={{
        display: "flex",
        gap: 9,
        marginTop: 22,
        padding: "12px 14px",
        background: "var(--surface-850)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        fontSize: 13,
        color: "var(--text-secondary)",
        lineHeight: 1.6,
      }}
    >
      <LuTriangleAlert size={15} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
      <span>{note}</span>
    </p>
  );
}

function FieldRow({
  field,
  value,
  hasPassword,
  onChange,
}: {
  field: SettingField;
  value: SettingValue;
  hasPassword: boolean;
  onChange: (value: SettingValue) => void;
}) {
  const label = (
    <label
      htmlFor={field.key}
      style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: field.help ? 3 : 8 }}
    >
      {field.label}
    </label>
  );
  const help = field.help ? (
    <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55, marginBottom: 9 }}>
      {field.help}
    </p>
  ) : null;

  if (field.kind === "bool") {
    return (
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => onChange(!value)}
          role="switch"
          aria-checked={value === true}
          style={{
            display: "flex",
            gap: 13,
            alignItems: "flex-start",
            width: "100%",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span
            style={{
              flexShrink: 0,
              width: 40,
              height: 23,
              borderRadius: 999,
              background: value ? "var(--brand-600)" : "var(--surface-700)",
              border: "1px solid var(--border)",
              position: "relative",
              transition: "background 0.15s",
              marginTop: 1,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: value ? 19 : 2,
                width: 17,
                height: 17,
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.15s",
                boxShadow: "var(--shadow-sm)",
              }}
            />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600, display: "block", color: "var(--text-primary)" }}>
              {field.label}
            </span>
            {field.help && (
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  lineHeight: 1.55,
                  display: "block",
                  marginTop: 3,
                }}
              >
                {field.help}
              </span>
            )}
          </span>
        </button>
      </div>
    );
  }

  if (field.kind === "choice") {
    return (
      <div style={{ marginBottom: 24 }}>
        {label}
        {help}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {field.choices.map(choice => {
            const on = value === choice.value;
            return (
              <button
                key={choice.value}
                onClick={() => onChange(choice.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "11px 14px",
                  background: on ? "var(--brand-100)" : "var(--surface-850)",
                  border: `1px solid ${on ? "var(--brand-500)" : "var(--border)"}`,
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 14,
                  color: "var(--text-primary)",
                  fontWeight: on ? 600 : 500,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: `2px solid ${on ? "var(--brand-600)" : "var(--border)"}`,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {on && (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "var(--brand-600)",
                      }}
                    />
                  )}
                </span>
                {choice.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.kind === "multi") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div style={{ marginBottom: 24 }}>
        {label}
        {help}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {field.choices.map(choice => {
            const on = selected.includes(choice.value);
            return (
              <button
                key={choice.value}
                onClick={() =>
                  onChange(
                    on
                      ? selected.filter(v => v !== choice.value)
                      : [...selected, choice.value],
                  )
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "8px 13px",
                  background: on ? "var(--brand-100)" : "var(--surface-850)",
                  border: `1px solid ${on ? "var(--brand-500)" : "var(--border)"}`,
                  borderRadius: 999,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: on ? 600 : 500,
                  color: "var(--text-primary)",
                }}
                aria-pressed={on}
              >
                {on && <LuCircleCheck size={13} color="var(--brand-600)" />}
                {choice.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.kind === "int") {
    const number = typeof value === "number" ? value : Number(value) || 0;
    return (
      <div style={{ marginBottom: 24 }}>
        {label}
        {help}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <input
            id={field.key}
            type="range"
            min={field.min ?? 0}
            max={field.max ?? 100}
            value={number}
            onChange={e => onChange(Number(e.target.value))}
            style={{ flex: 1, accentColor: "var(--brand-600)" }}
          />
          <span
            style={{
              minWidth: 46,
              textAlign: "right",
              fontSize: 14,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {number}
          </span>
        </div>
      </div>
    );
  }

  if (field.kind === "tags") {
    const tags = Array.isArray(value) ? value : [];
    return (
      <div style={{ marginBottom: 24 }}>
        {label}
        {help}
        <input
          id={field.key}
          type="text"
          className="input"
          value={tags.join(", ")}
          placeholder="dresses, ankara, made to order"
          onChange={e =>
            onChange(
              e.target.value
                .split(",")
                .map(part => part.trim())
                .filter(Boolean),
            )
          }
          style={{ width: "100%" }}
        />
      </div>
    );
  }

  if (field.kind === "text") {
    const text = typeof value === "string" ? value : "";
    return (
      <div style={{ marginBottom: 24 }}>
        {label}
        {help}
        <textarea
          id={field.key}
          className="input"
          value={text}
          maxLength={field.max_length ?? undefined}
          rows={3}
          onChange={e => onChange(e.target.value)}
          style={{ width: "100%", resize: "vertical", lineHeight: 1.6 }}
        />
        {field.max_length && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 5, textAlign: "right" }}>
            {text.length}/{field.max_length}
          </p>
        )}
      </div>
    );
  }

  // string, url — and the passcode, which is the one field whose saved value the
  // API deliberately does not return.
  const text = typeof value === "string" ? value : "";
  const isPasscode = field.key === "access_password";

  return (
    <div style={{ marginBottom: 24 }}>
      {label}
      {help}
      <input
        id={field.key}
        type={isPasscode ? "text" : field.kind === "url" ? "url" : "text"}
        className="input"
        value={text}
        maxLength={field.max_length ?? undefined}
        placeholder={
          isPasscode && hasPassword
            ? "A passcode is set — type a new one to replace it"
            : field.kind === "url"
              ? "https://"
              : ""
        }
        onChange={e => onChange(e.target.value)}
        style={{ width: "100%" }}
      />
    </div>
  );
}

/**
 * The favicon and the sharing image.
 *
 * Uploaded on selection rather than on Save: the file goes to a different
 * endpoint from the rest of the panel, and holding it in memory until Save means
 * a merchant who navigates away loses it with no sign anything was wrong.
 */
function AssetField({
  storeId,
  field,
  current,
  onUploaded,
}: {
  storeId: string;
  field: SettingField;
  current: string | null;
  onUploaded: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      await storefrontApi.uploadStoreAssets(storeId, { [field.key]: file } as {
        favicon?: File;
        social_image?: File;
      });
      onUploaded();
      toast.success(`${field.label} updated.`);
    } catch {
      toast.error("That upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const square = field.key === "favicon";

  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{field.label}</p>
      {field.help && (
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55, marginBottom: 12 }}>
          {field.help}
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div
          style={{
            width: square ? 64 : 190,
            height: square ? 64 : 100,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            background: "var(--surface-850)",
            display: "grid",
            placeItems: "center",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current}
              alt={field.label}
              style={{ width: "100%", height: "100%", objectFit: square ? "contain" : "cover" }}
            />
          ) : (
            <LuImage size={22} color="var(--text-disabled)" />
          )}
        </div>

        <div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => input.current?.click()}
            disabled={busy}
          >
            {busy ? <LuLoader size={14} className="spin" /> : <LuUpload size={14} />}
            {current ? "Replace" : "Upload"}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            hidden
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            {square ? "PNG or SVG, square, 64×64 or larger." : "JPG or PNG, 1200×630."}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The catalogue in and out as a spreadsheet.
 *
 * Import is two calls: a dry run that reports what would change and writes
 * nothing, then a commit. The merchant sees the counts and a sample of the names
 * before anything happens, because a file with prices in the wrong column is
 * much easier to fix than forty products that were created from it.
 */
function ImportExport({ storeId }: { storeId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState<"" | "export" | "template" | "check" | "commit">("");
  const input = useRef<HTMLInputElement>(null);

  const download = async (template: boolean) => {
    setBusy(template ? "template" : "export");
    try {
      const response = await productApi.exportCsv(storeId, template);
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = template ? "koraa-product-template.csv" : "products.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("That export failed.");
    } finally {
      setBusy("");
    }
  };

  const run = async (commit: boolean) => {
    if (!file) return;
    setBusy(commit ? "commit" : "check");
    try {
      const response = await productApi.importCsv(storeId, file, commit);
      setReport(response.data);
      if (commit) {
        toast.success(
          `${response.data.created ?? 0} added, ${response.data.updated ?? 0} updated.`,
        );
        setFile(null);
        if (input.current) input.current.value = "";
      }
    } catch (error) {
      // The 400 body carries the errors that matter — the parse failures, one
      // line per bad row — so it is shown rather than swallowed.
      const body = (error as { response?: { data?: ImportReport } }).response?.data;
      if (body && Array.isArray(body.errors)) setReport(body);
      else toast.error("That file could not be imported.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>Export</h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 14 }}>
          Your whole catalogue as a spreadsheet, in the same columns the importer accepts — so the
          file you download is one you can edit and put straight back. Variants and images are not
          included; those stay in the product editor.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-secondary btn-sm" onClick={() => download(false)} disabled={!!busy}>
            {busy === "export" ? <LuLoader size={14} className="spin" /> : <LuDownload size={14} />}
            Export products
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => download(true)} disabled={!!busy}>
            {busy === "template" ? <LuLoader size={14} className="spin" /> : <LuFileSpreadsheet size={14} />}
            Download a blank template
          </button>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 26 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>Import</h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 14 }}>
          A product already in your shop is updated rather than duplicated, matched on its slug or
          its name. Nothing is written until you confirm.
        </p>

        <div
          style={{
            border: "1px dashed var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "20px",
            textAlign: "center",
            background: "var(--surface-850)",
          }}
        >
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={e => {
              setReport(null);
              setFile(e.target.files?.[0] ?? null);
            }}
          />
          {file ? (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{file.name}</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
                {(file.size / 1024).toFixed(0)} KB
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => run(false)} disabled={!!busy}>
                  {busy === "check" ? <LuLoader size={14} className="spin" /> : <LuCircleCheck size={14} />}
                  Check the file
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => run(true)}
                  disabled={!!busy || (report ? report.errors.length > 0 : false)}
                >
                  {busy === "commit" ? <LuLoader size={14} className="spin" /> : <LuUpload size={14} />}
                  Import
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setFile(null);
                    setReport(null);
                    if (input.current) input.current.value = "";
                  }}
                  disabled={!!busy}
                >
                  Choose another
                </button>
              </div>
            </>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => input.current?.click()}>
              <LuUpload size={14} /> Choose a CSV
            </button>
          )}
        </div>

        {report && (
          <div style={{ marginTop: 18 }}>
            {report.errors.length > 0 ? (
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderLeft: "3px solid var(--danger)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px 16px",
                }}
              >
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--danger-text)",
                    marginBottom: 8,
                  }}
                >
                  {report.errors.length} problem{report.errors.length === 1 ? "" : "s"} in that file
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>
                  {report.errors.slice(0, 12).map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
                {report.errors.length > 12 && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                    …and {report.errors.length - 12} more.
                  </p>
                )}
              </div>
            ) : (
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderLeft: `3px solid ${report.committed ? "var(--success)" : "var(--brand-500)"}`,
                  borderRadius: "var(--radius-md)",
                  padding: "14px 16px",
                }}
              >
                <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                  {report.committed
                    ? `Done — ${report.created ?? 0} added, ${report.updated ?? 0} updated.`
                    : `Ready — ${report.create} to add, ${report.update} to update.`}
                </p>
                {!report.committed && (report.create_sample?.length || report.update_sample?.length) ? (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {report.create_sample?.length
                      ? `New: ${report.create_sample.join(", ")}${report.create > report.create_sample.length ? "…" : ""}. `
                      : ""}
                    {report.update_sample?.length
                      ? `Updating: ${report.update_sample.join(", ")}${report.update > report.update_sample.length ? "…" : ""}.`
                      : ""}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const backLink = {
  display: "inline-flex" as const,
  alignItems: "center" as const,
  gap: 6,
  color: "var(--text-muted)",
  fontSize: 14,
  textDecoration: "none" as const,
  marginBottom: 20,
};

const headerRow = {
  display: "flex" as const,
  flexWrap: "wrap" as const,
  gap: 16,
  justifyContent: "space-between" as const,
  alignItems: "flex-end" as const,
  marginBottom: 26,
};

const loadingBox = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  minHeight: "40vh",
};
