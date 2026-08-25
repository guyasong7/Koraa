"use client";

/**
 * The enquiries inbox.
 *
 * Every submission is emailed the moment it arrives, so this page is not how a
 * merchant finds out — it is the record. Addresses change, mail gets deleted,
 * and a lead that only ever existed in a message is a lead lost.
 *
 * Nothing here is editable except `is_read`: a lead a merchant can rewrite is
 * not evidence of anything.
 */

import PageTitle from "@/components/PageTitle";
import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LuArrowLeft,
  LuChevronLeft,
  LuChevronRight,
  LuInbox,
  LuLoader,
  LuMail,
  LuPencil,
  LuPhone,
  LuTrash2,
  LuTriangleAlert,
} from "react-icons/lu";
import toast from "react-hot-toast";

import { storefrontApi, storeApi, type FormSubmission, type Paginated } from "@/lib/api";

function when(iso: string): string {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / 1440)} d ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function EnquiriesPage() {
  const id = useParams().id as string;
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: store } = useQuery({
    queryKey: ["store", id],
    queryFn: () => storeApi.get(id).then(r => r.data),
    enabled: !!id,
  });

  const { data, isLoading, isFetching } = useQuery<Paginated<FormSubmission>>({
    queryKey: ["enquiries", id, page],
    queryFn: () => storefrontApi.listEnquiries(id, { page }).then(r => r.data),
    enabled: !!id,
  });

  const submissions = data?.results ?? [];
  const unread = submissions.filter(s => !s.is_read).length;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["enquiries", id] });

  const markRead = useMutation({
    mutationFn: ({ submission, isRead }: { submission: FormSubmission; isRead: boolean }) =>
      storefrontApi.markEnquiryRead(id, submission.id, isRead),
    onSuccess: refresh,
    onError: () => toast.error("Could not update that enquiry."),
  });

  const remove = useMutation({
    mutationFn: (submissionId: string) => storefrontApi.deleteEnquiry(id, submissionId),
    onSuccess: async () => {
      toast.success("Enquiry deleted.");
      setOpenId(null);
      await refresh();
    },
    onError: () => toast.error("Could not delete that enquiry."),
  });

  /** Opening a lead marks it read — the click is the acknowledgement. */
  const open = (submission: FormSubmission) => {
    const next = openId === submission.id ? null : submission.id;
    setOpenId(next);
    if (next && !submission.is_read) markRead.mutate({ submission, isRead: true });
  };

  return (
    <>
      <PageTitle title={`Enquiries — ${store?.name ?? "Store"} — Koraa`} />

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
              Enquiries
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
              {data
                ? `${data.count} in total${unread ? `, ${unread} unread on this page` : ""}.`
                : "What visitors sent through your form."}
            </p>
          </div>
          <Link className="btn btn-secondary" href={`/dashboard/stores/${id}/enquiry-form`}>
            <LuPencil size={16} /> Edit the form
          </Link>
        </div>

        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2].map(i => (
              <div key={i} className="skeleton" style={{ height: 68 }} />
            ))}
          </div>
        ) : !submissions.length ? (
          <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
            <LuInbox size={34} color="var(--text-muted)" style={{ margin: "0 auto 14px" }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>No enquiries yet</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 420, margin: "0 auto 18px" }}>
              When someone fills in your form the answers arrive here and in your email, with
              their address as the reply-to.
            </p>
            <Link className="btn btn-primary btn-sm" href={`/dashboard/stores/${id}/enquiry-form`}>
              Check your form
            </Link>
          </div>
        ) : (
          <>
            {submissions.map(submission => {
              const isOpen = openId === submission.id;
              return (
                <div
                  key={submission.id}
                  className="card"
                  style={{
                    marginBottom: 10, padding: 0, overflow: "hidden",
                    borderLeft: submission.is_read
                      ? "1px solid var(--border)"
                      : "3px solid var(--brand-500)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => open(submission)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 14,
                      padding: "14px 18px", background: "none", border: "none",
                      cursor: "pointer", textAlign: "left", color: "var(--text-primary)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 15, fontWeight: submission.is_read ? 600 : 800 }}>
                          {submission.sender_name || submission.sender_email || "Anonymous"}
                        </span>
                        {!submission.is_read && (
                          <span className="badge" style={{ background: "var(--brand-100)", color: "var(--brand-700)" }}>
                            New
                          </span>
                        )}
                        {!submission.emailed_at && (
                          <span
                            title="Stored here, but the notification email did not go out."
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--warning)" }}
                          >
                            <LuTriangleAlert size={12} /> not emailed
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          fontSize: 13, color: "var(--text-secondary)", margin: "2px 0 0",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                      >
                        {submission.summary || "—"}
                      </p>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>
                      {when(submission.created_at)}
                    </span>
                  </button>

                  {isOpen && (
                    <div style={{ padding: "0 18px 18px" }}>
                      <div
                        style={{
                          border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                          overflow: "hidden", marginBottom: 14,
                        }}
                      >
                        {submission.answers.map((answer, i) => (
                          <div
                            key={`${answer.key}-${i}`}
                            style={{
                              display: "grid", gridTemplateColumns: "180px 1fr", gap: 12,
                              padding: "10px 14px",
                              borderTop: i === 0 ? "none" : "1px solid var(--border)",
                            }}
                            className="enq-row"
                          >
                            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
                              {answer.label}
                            </span>
                            <span style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{answer.value}</span>
                          </div>
                        ))}
                      </div>

                      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
                        Sent {fullDate(submission.created_at)}
                      </p>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                        {submission.sender_email && (
                          <a
                            className="btn btn-primary btn-sm"
                            href={`mailto:${submission.sender_email}?subject=${encodeURIComponent(
                              `Re: your enquiry to ${store?.name ?? "us"}`,
                            )}`}
                          >
                            <LuMail size={14} /> Reply
                          </a>
                        )}
                        {submission.sender_phone && (
                          <a className="btn btn-secondary btn-sm" href={`tel:${submission.sender_phone}`}>
                            <LuPhone size={14} /> {submission.sender_phone}
                          </a>
                        )}
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => markRead.mutate({ submission, isRead: !submission.is_read })}
                          disabled={markRead.isPending}
                        >
                          Mark {submission.is_read ? "unread" : "read"}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ color: "var(--danger)" }}
                          onClick={() => {
                            if (confirm("Delete this enquiry? It cannot be recovered.")) {
                              remove.mutate(submission.id);
                            }
                          }}
                          disabled={remove.isPending}
                        >
                          {remove.isPending ? <LuLoader size={14} className="spin" /> : <LuTrash2 size={14} />}
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {(data?.next || data?.previous) && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 20 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={!data?.previous || isFetching}
                >
                  <LuChevronLeft size={14} /> Newer
                </button>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Page {page}</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={!data?.next || isFetching}
                >
                  Older <LuChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @media (max-width: 640px) {
          .enq-row { grid-template-columns: 1fr !important; gap: 2px !important; }
        }
      `}</style>
    </>
  );
}
