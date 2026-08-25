"use client";

/**
 * "They can come run their site SEO."
 *
 * A report the merchant asks for, on demand. Every threshold, every check and
 * every piece of advice lives in `backend/apps/stores/seo.py` — this page
 * renders whatever the audit returns and knows none of the rules, so adding a
 * check never touches this file.
 *
 * The two fields that matter most are editable here rather than buried in
 * Settings, next to a live preview of the search result they produce: a
 * character counter is abstract, a listing that visibly gets cut off is not.
 */

import PageTitle from "@/components/PageTitle";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LuArrowLeft,
  LuCircleCheck,
  LuCircleX,
  LuExternalLink,
  LuGauge,
  LuLoader,
  LuRefreshCw,
  LuSave,
  LuTriangleAlert,
} from "react-icons/lu";
import toast from "react-hot-toast";

import { storeApi } from "@/lib/api";
import type { SeoCheck, SeoReport, SeoStatus } from "@/lib/api";

const TITLE_MAX = 70;
const DESC_MAX = 160;
/** Where a search engine cuts the line off, which is earlier than the column. */
const TITLE_DISPLAY = 60;

const STATUS_STYLE: Record<SeoStatus, { color: string; fill: string; label: string }> = {
  pass: { color: "var(--success-text)", fill: "var(--success)", label: "Good" },
  warn: { color: "var(--warning-text)", fill: "var(--warning)", label: "Could be better" },
  fail: { color: "var(--danger-text)", fill: "var(--danger)", label: "Needs fixing" },
};

function StatusIcon({ status, size = 18 }: { status: SeoStatus; size?: number }) {
  const color = STATUS_STYLE[status].fill;
  if (status === "pass") return <LuCircleCheck size={size} color={color} />;
  if (status === "warn") return <LuTriangleAlert size={size} color={color} />;
  return <LuCircleX size={size} color={color} />;
}

export default function StoreSeoPage() {
  const id = useParams().id as string;
  const queryClient = useQueryClient();

  const { data: store } = useQuery({
    queryKey: ["store", id],
    queryFn: () => storeApi.get(id).then(r => r.data),
    enabled: !!id,
  });

  const {
    data: report,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<SeoReport>({
    queryKey: ["store-seo", id],
    queryFn: () => storeApi.seoAudit(id).then(r => r.data),
    enabled: !!id,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);

  // Seeded from the store, not from the report: the report shows what a search
  // engine would fall back to when a field is blank, which is not what should
  // appear in an input the merchant is about to edit.
  useEffect(() => {
    if (!store || touched) return;
    setTitle(store.seo_title ?? "");
    setDescription(store.seo_description ?? "");
  }, [store, touched]);

  const save = useMutation({
    mutationFn: () =>
      storeApi.update(id, { seo_title: title, seo_description: description }),
    onSuccess: async () => {
      setTouched(false);
      toast.success("Search listing saved.");
      // Both are stale now: the store carries the new text, and the audit was
      // scored against the old.
      await queryClient.invalidateQueries({ queryKey: ["store", id] });
      await refetch();
    },
    onError: () => toast.error("Could not save your search listing."),
  });

  return (
    <>
      <PageTitle title={`SEO — ${store?.name ?? "Store"} — Koraa`} />

      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <Link
          href={`/dashboard/stores/${id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--text-muted)",
            fontSize: 14,
            textDecoration: "none",
            marginBottom: 20,
          }}
        >
          <LuArrowLeft size={15} /> Back to store
        </Link>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: 28,
          }}
        >
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.02em" }}>
              SEO
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
              How findable {store?.name ?? "this store"} is, and what to fix next.
            </p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <LuLoader size={16} className="spin" /> : <LuRefreshCw size={16} />}
            Run again
          </button>
        </div>

        {isLoading || !report ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              minHeight: "40vh",
              justifyContent: "center",
            }}
          >
            <LuLoader size={32} className="spin" color="var(--brand-500)" />
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Running your audit…</p>
          </div>
        ) : (
          <>
            <ScoreCard report={report} />

            {report.priorities.length > 0 && (
              <section className="card" style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Do this next</h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18 }}>
                  The {report.priorities.length} changes that will move the score most.
                </p>
                <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {report.priorities.map((check, i) => (
                    <li
                      key={check.key}
                      style={{
                        display: "flex",
                        gap: 14,
                        padding: "14px 0",
                        borderTop: i === 0 ? "none" : "1px solid var(--border)",
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: "var(--surface-850)",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--text-secondary)",
                        }}
                      >
                        {i + 1}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>
                          {check.label}
                        </p>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                          {check.detail}
                        </p>
                        {check.action && (
                          <Link
                            href={check.action.href}
                            style={{
                              display: "inline-block",
                              marginTop: 8,
                              fontSize: 13,
                              fontWeight: 600,
                              color: "var(--brand-500)",
                              textDecoration: "none",
                            }}
                          >
                            {check.action.label} →
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section className="card" style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Your search listing</h2>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
                This is the advert search engines show for free. Write it as one.
              </p>

              <Field
                label="Search title"
                value={title}
                max={TITLE_MAX}
                display={TITLE_DISPLAY}
                placeholder={`${store?.name ?? "Your shop"} — what you sell, where`}
                onChange={v => {
                  setTouched(true);
                  setTitle(v);
                }}
              />

              <Field
                label="Search description"
                value={description}
                max={DESC_MAX}
                display={DESC_MAX}
                textarea
                placeholder="What you sell, who it is for and where you deliver."
                onChange={v => {
                  setTouched(true);
                  setDescription(v);
                }}
              />

              <Preview
                title={title || store?.name || "Your shop"}
                url={report.preview.url}
                description={description}
              />

              <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 20 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => save.mutate()}
                  disabled={save.isPending || !touched}
                >
                  {save.isPending ? <LuLoader size={16} className="spin" /> : <LuSave size={16} />}
                  Save & re-run
                </button>
                <a
                  href={report.store.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <LuExternalLink size={13} /> View storefront
                </a>
              </div>
            </section>

            {report.groups.map(group => (
              <section className="card" key={group.key} style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 3 }}>{group.title}</h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                  {group.blurb}
                </p>
                <div>
                  {group.checks.map((check, i) => (
                    <CheckRow key={check.key} check={check} first={i === 0} />
                  ))}
                </div>
              </section>
            ))}

            <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "8px 0 32px" }}>
              Audited {new Date(report.generated_at).toLocaleString()}.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function ScoreCard({ report }: { report: SeoReport }) {
  const { score, grade, summary } = report;
  const tone: SeoStatus = score >= 80 ? "pass" : score >= 55 ? "warn" : "fail";
  const ring = STATUS_STYLE[tone].fill;

  // A 44px-radius circle: circumference 2πr ≈ 276.5.
  const circumference = 276.5;
  const filled = (circumference * Math.min(100, Math.max(0, score))) / 100;

  return (
    <section
      className="card"
      style={{ marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 32, alignItems: "center" }}
    >
      <div style={{ position: "relative", width: 108, height: 108, flexShrink: 0 }}>
        <svg width="108" height="108" viewBox="0 0 108 108" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="54" cy="54" r="44" fill="none" stroke="var(--surface-850)" strokeWidth="10" />
          <circle
            cx="54"
            cy="54"
            r="44"
            fill="none"
            stroke={ring}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            lineHeight: 1,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 30, fontWeight: 800, fontFamily: "Outfit, sans-serif" }}>{score}</p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: ".06em" }}>
              GRADE {grade}
            </p>
          </div>
        </div>
      </div>

      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <LuGauge size={18} color="var(--brand-500)" /> SEO score
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 14 }}>
          {summary.passed} of {summary.total} checks pass
          {summary.problems > 0 && `, ${summary.problems} need fixing`}
          {summary.warnings > 0 && `, ${summary.warnings} could be better`}.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <Tally status="pass" count={summary.passed} label="Passing" />
          <Tally status="warn" count={summary.warnings} label="Warnings" />
          <Tally status="fail" count={summary.problems} label="Problems" />
        </div>
      </div>
    </section>
  );
}

function Tally({ status, count, label }: { status: SeoStatus; count: number; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}>
      <StatusIcon status={status} size={15} />
      <strong style={{ fontWeight: 700 }}>{count}</strong>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
    </span>
  );
}

function Field({
  label,
  value,
  max,
  display,
  placeholder,
  textarea,
  onChange,
}: {
  label: string;
  value: string;
  max: number;
  /** Where search engines truncate, which may be shorter than `max`. */
  display: number;
  placeholder: string;
  textarea?: boolean;
  onChange: (value: string) => void;
}) {
  const length = value.length;
  const over = length > display;
  const counterColor = over
    ? "var(--warning-text)"
    : length === 0
      ? "var(--text-muted)"
      : "var(--text-secondary)";

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>{label}</label>
        <span style={{ fontSize: 12, color: counterColor, fontVariantNumeric: "tabular-nums" }}>
          {length}/{display}
          {over && " — will be cut off"}
        </span>
      </div>
      {textarea ? (
        <textarea
          className="input"
          value={value}
          maxLength={max}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          rows={3}
          style={{ width: "100%", resize: "vertical", lineHeight: 1.6 }}
        />
      ) : (
        <input
          type="text"
          className="input"
          value={value}
          maxLength={max}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          style={{ width: "100%" }}
        />
      )}
    </div>
  );
}

/** What the listing looks like as typed, truncation and all. */
function Preview({ title, url, description }: { title: string; url: string; description: string }) {
  const host = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const shownTitle = title.length > TITLE_DISPLAY ? `${title.slice(0, TITLE_DISPLAY)}…` : title;
  const shownDesc =
    description.length > DESC_MAX ? `${description.slice(0, DESC_MAX)}…` : description;

  return (
    <div
      style={{
        background: "var(--surface-850)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl)",
        padding: "18px 20px",
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", color: "var(--text-muted)", marginBottom: 12 }}>
        SEARCH RESULT PREVIEW
      </p>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 3 }}>{host}</p>
      <p style={{ fontSize: 18, color: "#1a0dab", marginBottom: 4, lineHeight: 1.3 }}>{shownTitle}</p>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
        {shownDesc || (
          <em style={{ color: "var(--text-muted)" }}>
            With no description, search engines quote whatever text they find first.
          </em>
        )}
      </p>
    </div>
  );
}

function CheckRow({ check, first }: { check: SeoCheck; first: boolean }) {
  const style = STATUS_STYLE[check.status];
  const muted = !check.applicable;

  return (
    <div
      style={{
        display: "flex",
        gap: 13,
        padding: "14px 0",
        borderTop: first ? "none" : "1px solid var(--border)",
        opacity: muted ? 0.55 : 1,
      }}
    >
      <span style={{ flexShrink: 0, paddingTop: 1 }}>
        <StatusIcon status={check.status} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
          <p style={{ fontWeight: 600, fontSize: 14 }}>{check.label}</p>
          {!muted && (
            <span style={{ fontSize: 11, fontWeight: 700, color: style.color, letterSpacing: ".03em" }}>
              {style.label.toUpperCase()}
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55, marginTop: 3 }}>
          {check.detail}
        </p>
        {check.fix && (
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55, marginTop: 6 }}>
            {check.fix}
          </p>
        )}
        {check.action && (
          <Link
            href={check.action.href}
            style={{
              display: "inline-block",
              marginTop: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--brand-500)",
              textDecoration: "none",
            }}
          >
            {check.action.label} →
          </Link>
        )}
      </div>
    </div>
  );
}
