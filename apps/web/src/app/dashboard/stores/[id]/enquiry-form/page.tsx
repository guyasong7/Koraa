"use client";

/**
 * The enquiry-form builder.
 *
 * "For services they will be able to customize a form on their website to match
 * what they want, and they can email them through the form."
 *
 * A photographer cannot price a wedding from a product grid, so the shop's way
 * of being asked is a form the merchant shapes themselves. What arrives is
 * emailed with the sender's address as reply-to — answering a lead is hitting
 * Reply — and kept in the inbox at `../enquiries` as well, because a lead that
 * only ever existed in a message is a lead lost.
 *
 * The palette of field types is not written out here: it arrives on the
 * response as `field_types`, so adding a type is a backend-only change. The one
 * rule this page enforces locally is the key format, because a merchant typing
 * a label should never have to think about it.
 */

import PageTitle from "@/components/PageTitle";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LuArrowLeft,
  LuChevronDown,
  LuChevronUp,
  LuCircleAlert,
  LuExternalLink,
  LuInbox,
  LuLoader,
  LuPlus,
  LuSave,
  LuTrash2,
} from "react-icons/lu";
import toast from "react-hot-toast";

import { storefrontApi, storeApi, type ServiceFormConfig, type ServiceFormFieldType } from "@/lib/api";
import type { ServiceFormField } from "@/types/storefront";

/** Mirrors the RegexField on the backend's field serializer. */
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/** A label turned into a key the backend will accept. */
function keyFromLabel(label: string, taken: string[]): string {
  let base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36);
  if (!base || !/^[a-z]/.test(base)) base = `field_${base}`.slice(0, 36);
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}_${n}`.slice(0, 40);
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}_x`;
}

function needsOptions(type: string, palette: ServiceFormFieldType[]): boolean {
  const entry = palette.find(t => t.type === type);
  if (entry) return !!entry.options;
  // Falls back to the three the backend requires options for, so a form still
  // renders sensibly if the palette has not loaded yet.
  return ["select", "radio", "checkboxes"].includes(type);
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: "var(--brand-600)", width: 16, height: 16, marginTop: 2 }}
      />
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{label}</p>
        {hint && <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{hint}</p>}
      </div>
    </label>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 5 }}>{hint}</p>}
    </div>
  );
}

export default function EnquiryFormBuilderPage() {
  const id = useParams().id as string;
  const queryClient = useQueryClient();

  const { data: store } = useQuery({
    queryKey: ["store", id],
    queryFn: () => storeApi.get(id).then(r => r.data),
    enabled: !!id,
  });

  const { data: remote, isLoading } = useQuery<ServiceFormConfig>({
    queryKey: ["service-form", id],
    queryFn: () => storefrontApi.getServiceForm(id).then(r => r.data),
    enabled: !!id,
  });

  const [draft, setDraft] = useState<ServiceFormConfig | null>(null);
  const [notifyText, setNotifyText] = useState("");
  const [openField, setOpenField] = useState<string | null>(null);

  // Seeded once. Re-seeding on every refetch would throw away edits the moment
  // React Query revalidated in the background.
  useEffect(() => {
    if (remote && !draft) {
      setDraft(remote);
      setNotifyText((remote.notify_emails ?? []).join(", "));
    }
  }, [remote, draft]);

  const palette = remote?.field_types ?? [];

  const set = <K extends keyof ServiceFormConfig>(key: K, value: ServiceFormConfig[K]) =>
    setDraft(d => (d ? { ...d, [key]: value } : d));

  const setField = (index: number, patch: Partial<ServiceFormField>) =>
    setDraft(d =>
      d
        ? { ...d, fields: d.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) }
        : d,
    );

  const moveField = (index: number, delta: number) =>
    setDraft(d => {
      if (!d) return d;
      const target = index + delta;
      if (target < 0 || target >= d.fields.length) return d;
      const fields = [...d.fields];
      [fields[index], fields[target]] = [fields[target], fields[index]];
      return { ...d, fields };
    });

  const removeField = (index: number) =>
    setDraft(d => (d ? { ...d, fields: d.fields.filter((_, i) => i !== index) } : d));

  const addField = (type: string) => {
    setDraft(d => {
      if (!d) return d;
      const entry = palette.find(t => t.type === type);
      const label = entry?.label ?? "New field";
      const key = keyFromLabel(label, d.fields.map(f => f.key));
      const field: ServiceFormField = {
        key,
        label,
        type: type as ServiceFormField["type"],
        required: false,
        placeholder: "",
        help: "",
        options: needsOptions(type, palette) ? ["First option"] : [],
        width: type === "textarea" ? "full" : "half",
      };
      setOpenField(key);
      return { ...d, fields: [...d.fields, field] };
    });
  };

  const save = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("Nothing to save");
      return storefrontApi.updateServiceForm(id, {
        is_enabled: draft.is_enabled,
        title: draft.title,
        description: draft.description,
        submit_label: draft.submit_label,
        success_message: draft.success_message,
        fields: draft.fields,
        notify_emails: notifyText
          .split(/[,\n]/)
          .map(s => s.trim())
          .filter(Boolean),
        send_copy_to_sender: draft.send_copy_to_sender,
      });
    },
    onSuccess: async res => {
      setDraft(res.data);
      setNotifyText((res.data.notify_emails ?? []).join(", "));
      toast.success("Form saved.");
      await queryClient.invalidateQueries({ queryKey: ["service-form", id] });
    },
    onError: (err: any) => {
      const data = err?.response?.data;
      // The backend reports field-list problems under `fields`, and they are
      // the ones a merchant can actually act on ("include an email field").
      const first =
        data?.fields?.[0] ??
        data?.notify_emails?.[0] ??
        data?.detail ??
        Object.values(data ?? {})[0];
      toast.error(
        typeof first === "string"
          ? first
          : Array.isArray(first)
            ? String(first[0])
            : "Could not save the form.",
      );
    },
  });

  const problems: string[] = [];
  if (draft) {
    if (!draft.fields.length) problems.push("The form has no fields.");
    if (draft.fields.length && !draft.fields.some(f => f.type === "email")) {
      problems.push("Add an email field, or you will have no way to reply.");
    }
    const keys = draft.fields.map(f => f.key);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length) problems.push(`Two fields share the name “${dupes[0]}”.`);
    const bad = draft.fields.find(f => !KEY_PATTERN.test(f.key));
    if (bad) problems.push(`“${bad.key || "(blank)"}” is not a valid field name.`);
    const emptyOptions = draft.fields.find(
      f => needsOptions(f.type, palette) && !(f.options ?? []).filter(o => o.trim()).length,
    );
    if (emptyOptions) problems.push(`“${emptyOptions.label}” needs at least one option.`);
  }

  return (
    <>
      <PageTitle title={`Enquiry form — ${store?.name ?? "Store"} — Koraa`} />

      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Link
          href={`/dashboard/stores/${id}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            color: "var(--text-muted)", fontSize: 14, textDecoration: "none", marginBottom: 20,
          }}
        >
          <LuArrowLeft size={15} /> Back to store
        </Link>

        <div
          style={{
            display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between",
            alignItems: "flex-end", marginBottom: 28,
          }}
        >
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.02em" }}>
              Enquiry form
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
              What visitors fill in when they want a quote. Answers land in your inbox with
              their address as the reply-to.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="btn btn-secondary" href={`/dashboard/stores/${id}/enquiries`}>
              <LuInbox size={16} /> Enquiries
              {!!remote?.submission_count && ` (${remote.submission_count})`}
            </Link>
            <button
              className="btn btn-primary"
              onClick={() => save.mutate()}
              disabled={save.isPending || !draft || problems.length > 0}
            >
              {save.isPending ? <LuLoader size={16} className="spin" /> : <LuSave size={16} />}
              Save form
            </button>
          </div>
        </div>

        {isLoading || !draft ? (
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
              minHeight: "40vh", justifyContent: "center",
            }}
          >
            <LuLoader size={32} className="spin" color="var(--brand-500)" />
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading your form…</p>
          </div>
        ) : (
          <>
            {problems.length > 0 && (
              <div
                className="card"
                style={{
                  marginBottom: 20, borderColor: "var(--warning)",
                  display: "flex", gap: 12, alignItems: "flex-start",
                }}
              >
                <LuCircleAlert size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>
                    Fix these before saving
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text-secondary)" }}>
                    {problems.map(p => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              </div>
            )}

            <section className="card" style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>The form itself</h2>

              <div style={{ marginBottom: 18 }}>
                <Toggle
                  checked={draft.is_enabled}
                  onChange={v => set("is_enabled", v)}
                  label="Show the form on my storefront"
                  hint="Turned off, the enquiry section disappears and submissions are refused."
                />
              </div>

              <Field label="Heading">
                <input className="input" value={draft.title} maxLength={160} onChange={e => set("title", e.target.value)} />
              </Field>
              <Field label="Intro text" hint="One or two lines above the fields.">
                <textarea
                  className="input"
                  value={draft.description}
                  onChange={e => set("description", e.target.value)}
                  style={{ minHeight: 70, resize: "vertical" }}
                />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="ef-two">
                <Field label="Button text">
                  <input className="input" value={draft.submit_label} maxLength={60} onChange={e => set("submit_label", e.target.value)} />
                </Field>
                <Field label="Thank-you message" hint="Shown once it has sent.">
                  <input className="input" value={draft.success_message} maxLength={300} onChange={e => set("success_message", e.target.value)} />
                </Field>
              </div>
            </section>

            <section className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Fields</h2>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {draft.fields.length} field{draft.fields.length === 1 ? "" : "s"}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18 }}>
                Ask for what you need to quote, and nothing more — every extra box costs you
                enquiries.
              </p>

              {draft.fields.map((field, index) => {
                const open = openField === field.key;
                return (
                  <div
                    key={`${field.key}-${index}`}
                    style={{ border: "1px solid var(--border)", marginBottom: 10 }}
                  >
                    <div
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                        background: open ? "var(--surface-850)" : "transparent",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenField(open ? null : field.key)}
                        style={{
                          flex: 1, display: "flex", alignItems: "center", gap: 8,
                          background: "none", border: "none", cursor: "pointer",
                          textAlign: "left", padding: 0, color: "var(--text-primary)",
                        }}
                      >
                        {open ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{field.label || "(no label)"}</span>
                        <span
                          className="badge"
                          style={{ fontSize: 10, textTransform: "lowercase" }}
                        >
                          {palette.find(t => t.type === field.type)?.label ?? field.type}
                        </span>
                        {field.required && (
                          <span style={{ fontSize: 11, color: "var(--danger)", fontWeight: 600 }}>required</span>
                        )}
                      </button>
                      <button
                        type="button"
                        title="Move up"
                        onClick={() => moveField(index, -1)}
                        disabled={index === 0}
                        className="ef-icon"
                      >
                        <LuChevronUp size={13} />
                      </button>
                      <button
                        type="button"
                        title="Move down"
                        onClick={() => moveField(index, 1)}
                        disabled={index === draft.fields.length - 1}
                        className="ef-icon"
                      >
                        <LuChevronDown size={13} />
                      </button>
                      <button
                        type="button"
                        title="Delete field"
                        onClick={() => removeField(index)}
                        className="ef-icon"
                        style={{ color: "var(--danger)" }}
                      >
                        <LuTrash2 size={13} />
                      </button>
                    </div>

                    {open && (
                      <div style={{ padding: "16px 12px", borderTop: "1px solid var(--border)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="ef-two">
                          <Field label="Label">
                            <input
                              className="input"
                              value={field.label}
                              maxLength={160}
                              onChange={e => setField(index, { label: e.target.value })}
                            />
                          </Field>
                          <Field label="Type">
                            <select
                              className="input"
                              value={field.type}
                              onChange={e => {
                                const type = e.target.value as ServiceFormField["type"];
                                setField(index, {
                                  type,
                                  options: needsOptions(type, palette)
                                    ? (field.options?.length ? field.options : ["First option"])
                                    : [],
                                });
                              }}
                            >
                              {(palette.length
                                ? palette
                                : [{ type: field.type, label: field.type }]
                              ).map(t => (
                                <option key={t.type} value={t.type}>{t.label}</option>
                              ))}
                            </select>
                          </Field>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="ef-two">
                          <Field label="Placeholder" hint="Greyed-out example text.">
                            <input
                              className="input"
                              value={field.placeholder ?? ""}
                              maxLength={160}
                              onChange={e => setField(index, { placeholder: e.target.value })}
                            />
                          </Field>
                          <Field label="Width">
                            <select
                              className="input"
                              value={field.width ?? "full"}
                              onChange={e => setField(index, { width: e.target.value as "full" | "half" })}
                            >
                              <option value="half">Half — two to a row</option>
                              <option value="full">Full width</option>
                            </select>
                          </Field>
                        </div>

                        <Field label="Help text" hint="Shown under the input.">
                          <input
                            className="input"
                            value={field.help ?? ""}
                            maxLength={300}
                            onChange={e => setField(index, { help: e.target.value })}
                          />
                        </Field>

                        {needsOptions(field.type, palette) && (
                          <Field label="Options" hint="One per line.">
                            <textarea
                              className="input"
                              value={(field.options ?? []).join("\n")}
                              onChange={e =>
                                setField(index, {
                                  options: e.target.value.split("\n").slice(0, 30),
                                })
                              }
                              style={{ minHeight: 90, resize: "vertical" }}
                            />
                          </Field>
                        )}

                        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
                          <Toggle
                            checked={!!field.required}
                            onChange={v => setField(index, { required: v })}
                            label="Required"
                          />
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            Saved as <code>{field.key}</code>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                {(palette.length ? palette : [{ type: "text", label: "Short text" }]).map(t => (
                  <button
                    key={t.type}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => addField(t.type)}
                  >
                    <LuPlus size={13} /> {t.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="card" style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>Where enquiries go</h2>
              <Field
                label="Email them to"
                hint="Up to five addresses, separated by commas. Leave blank to use your shop's own address."
              >
                <input
                  className="input"
                  value={notifyText}
                  placeholder={store?.email || "you@example.com"}
                  onChange={e => setNotifyText(e.target.value)}
                />
              </Field>
              <Toggle
                checked={draft.send_copy_to_sender}
                onChange={v => set("send_copy_to_sender", v)}
                label="Send the visitor a copy of what they wrote"
                hint="Reassures them it went through, and gives them your name in their inbox."
              />
            </section>

            <p style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <LuExternalLink size={14} />
              The form appears in the “Enquiry Form” section of your storefront — add it from{" "}
              <Link href={`/dashboard/stores/${id}/settings`} style={{ color: "var(--brand-500)" }}>
                Customize
              </Link>{" "}
              if it is not there yet.
            </p>
          </>
        )}
      </div>

      <style>{`
        .ef-icon {
          background: transparent;
          border: 1px solid var(--border);
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--text-secondary);
        }
        .ef-icon:disabled { opacity: .35; cursor: default; }
        @media (max-width: 720px) {
          .ef-two { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
