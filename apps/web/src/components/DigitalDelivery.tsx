"use client";

/**
 * The two panels a non-physical product needs.
 *
 * `DigitalFilesPanel` is what turns a digital product into something that can
 * actually be sold: without at least one file, checkout refuses the line
 * (`_price_and_reserve` in the orders app), because taking money and delivering
 * nothing is worse than a failed sale.
 *
 * `ServiceEnquiryPanel` is the opposite case — a service is never priced at
 * checkout, it is quoted through the shop's enquiry form, so the only decision
 * here is whether the card shows an enquiry button.
 *
 * Both live outside the product pages because the new-product page and the edit
 * page need the same controls, and the only difference between them is whether
 * there is a product id yet to upload against.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef } from "react";
import toast from "react-hot-toast";
import {
  LuDownload, LuFile, LuInfo, LuLoader, LuMail, LuTrash2, LuUpload, LuX,
} from "react-icons/lu";

import { productApi, type ProductFile } from "@/lib/api";
import { formatBytes } from "@/lib/format";

/** Mirrors `MAX_PRODUCT_FILE_BYTES` in `apps/products/views.py`. */
const MAX_FILE_BYTES = 512 * 1024 * 1024;

/**
 * Mirrors `BLOCKED_FILE_EXTENSIONS` in `apps/products/views.py`.
 *
 * Checked here as well as there so a merchant learns about it before waiting
 * out a 400 MB upload. The backend is still the one that decides.
 */
const BLOCKED_EXTENSIONS = [
  "exe", "msi", "bat", "cmd", "com", "scr", "cpl", "jar",
  "vbs", "vbe", "js", "jse", "wsf", "wsh", "ps1", "sh", "php", "phtml",
];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Rejects what the backend would reject, with the same wording. */
function rejectionReason(file: File): string | null {
  const ext = extensionOf(file.name);
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return `.${ext} files cannot be sold through Koraa.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `${file.name} is larger than ${formatBytes(MAX_FILE_BYTES)}.`;
  }
  if (!file.size) {
    return `${file.name} is empty.`;
  }
  return null;
}

function PanelShell({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: "var(--surface-900)", border: "1px solid var(--border)", marginBottom: 16 }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon size={16} color="var(--brand-600)" />
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{title}</span>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 5 }}>{hint}</p>}
    </div>
  );
}

function FileRow({
  name,
  size,
  onRemove,
  removing,
  pending,
}: {
  name: string;
  size: number;
  onRemove: () => void;
  removing?: boolean;
  pending?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 12px", border: "1px solid var(--border)",
        background: pending ? "var(--surface)" : "transparent",
        marginBottom: 8,
      }}
    >
      <LuFile size={15} color="var(--text-muted)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
          {formatBytes(size)}
          {pending && " · uploads when you save"}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        title="Remove file"
        style={{
          background: "transparent", border: "1px solid var(--border)",
          width: 26, height: 26, display: "flex", alignItems: "center",
          justifyContent: "center", cursor: removing ? "default" : "pointer",
          color: "var(--danger)",
        }}
      >
        {removing ? <LuLoader size={12} className="spin" /> : pending ? <LuX size={12} /> : <LuTrash2 size={12} />}
      </button>
    </div>
  );
}

export interface DigitalFilesPanelProps {
  storeId: string;
  /** Absent on the new-product page — files are queued and uploaded after save. */
  productId?: string;
  /** Files chosen but not yet uploaded. Always used on the new-product page. */
  pending: File[];
  onPendingChange: (files: File[]) => void;
  /** `download_limit`, kept as a string because it comes from an input. */
  limit: string;
  onLimitChange: (value: string) => void;
  /** `download_window_days`, likewise. */
  windowDays: string;
  onWindowChange: (value: string) => void;
}

export function DigitalFilesPanel({
  storeId,
  productId,
  pending,
  onPendingChange,
  limit,
  onLimitChange,
  windowDays,
  onWindowChange,
}: DigitalFilesPanelProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: files, isLoading } = useQuery({
    queryKey: ["product-files", storeId, productId],
    queryFn: () => productApi.listFiles(storeId, productId!).then((r) => r.data),
    enabled: !!storeId && !!productId,
  });

  const uploaded: ProductFile[] = files ?? [];

  const addFiles = (chosen: FileList | File[]) => {
    const accepted: File[] = [];
    Array.from(chosen).forEach((file) => {
      const reason = rejectionReason(file);
      if (reason) toast.error(reason);
      else accepted.push(file);
    });
    if (accepted.length) onPendingChange([...pending, ...accepted]);
  };

  const handleDelete = async (file: ProductFile) => {
    if (!productId) return;
    if (!confirm(`Delete “${file.name}”? Buyers who already have a link will lose access to it.`)) return;
    try {
      await productApi.deleteFile(storeId, productId, file.id);
      queryClient.invalidateQueries({ queryKey: ["product-files", storeId, productId] });
      toast.success("File deleted");
    } catch {
      toast.error("Failed to delete file");
    }
  };

  const nothingToSell = !isLoading && !uploaded.length && !pending.length;

  return (
    <PanelShell title="Digital delivery" icon={LuDownload}>
      {nothingToSell && (
        <div
          style={{
            display: "flex", gap: 10, padding: "12px 14px", marginBottom: 20,
            border: "1px solid var(--warning)", background: "color-mix(in srgb, var(--warning) 8%, transparent)",
          }}
        >
          <LuInfo size={15} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
            Add at least one file. Until you do, this product cannot be bought — checkout
            refuses it rather than take money for something it cannot deliver.
          </p>
        </div>
      )}

      {isLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          <LuLoader size={14} className="spin" /> Loading files…
        </div>
      )}

      {uploaded.map((file) => (
        <FileRow key={file.id} name={file.name} size={file.size_bytes} onRemove={() => handleDelete(file)} />
      ))}

      {pending.map((file, idx) => (
        <FileRow
          key={`${file.name}-${idx}`}
          name={file.name}
          size={file.size}
          pending
          onRemove={() => onPendingChange(pending.filter((_, i) => i !== idx))}
        />
      ))}

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        style={{
          border: "1.5px dashed var(--border)", background: "var(--surface)",
          padding: "20px 16px", textAlign: "center", cursor: "pointer", marginBottom: 20,
        }}
      >
        <LuUpload size={20} color="var(--text-muted)" style={{ margin: "0 auto 8px" }} />
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          {productId ? "Click or drop files to upload" : "Choose the files buyers will download"}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
          Up to {formatBytes(MAX_FILE_BYTES)} each. Programs and scripts are not accepted.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            // Cleared so choosing the same file twice still fires a change.
            e.target.value = "";
          }}
        />
      </div>

      <div className="mobile-stack-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Row label="Download limit" hint="How many times one buyer may download. 0 for unlimited.">
          <input
            className="input"
            type="number"
            min="0"
            value={limit}
            onChange={(e) => onLimitChange(e.target.value)}
          />
        </Row>
        <Row label="Link stays live for" hint="Days after purchase. 0 for forever.">
          <input
            className="input"
            type="number"
            min="0"
            value={windowDays}
            onChange={(e) => onWindowChange(e.target.value)}
          />
        </Row>
      </div>

      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
        Buyers are emailed a private link as soon as their payment clears. The files are
        streamed through that link, never linked to directly, so nobody can share a URL that
        works forever. Changing these limits only affects future purchases.
      </p>
    </PanelShell>
  );
}

export function ServiceEnquiryPanel({
  storeId,
  acceptsEnquiries,
  onChange,
}: {
  storeId: string;
  acceptsEnquiries: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <PanelShell title="Service enquiries" icon={LuMail}>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginBottom: 16 }}>
        <input
          type="checkbox"
          checked={acceptsEnquiries}
          onChange={(e) => onChange(e.target.checked)}
          style={{ accentColor: "var(--brand-600)", width: 16, height: 16, marginTop: 2 }}
        />
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Take enquiries for this service</p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
            The card shows an enquiry button instead of add-to-cart.
          </p>
        </div>
      </label>

      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16 }}>
        Services are never charged at checkout — a wedding or a consultation is quoted, not
        added to a basket. Visitors fill in your enquiry form and the answers arrive in your
        inbox with their address as the reply-to, so answering is hitting Reply.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Link className="btn btn-secondary btn-sm" href={`/dashboard/stores/${storeId}/enquiry-form`}>
          Edit the enquiry form
        </Link>
        <Link className="btn btn-secondary btn-sm" href={`/dashboard/stores/${storeId}/enquiries`}>
          See enquiries
        </Link>
      </div>
    </PanelShell>
  );
}
