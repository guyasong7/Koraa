"use client";

import PageTitle from "@/components/PageTitle";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserMultipleIcon, Loading03Icon } from "@hugeicons/core-free-icons";
import { useState, useEffect } from "react";

export default function CustomersPage() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <PageTitle title="Customers — Koraa" />
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: 32,
          }}
        >
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.02em" }}>
              Customers
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
              Understand and manage your customer relationships.
            </p>
          </div>
        </div>

        {isLoading ? (
          <Spinner label="Loading customers…" />
        ) : (
          <EmptyState />
        )}
      </div>
    </>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "40vh",
        gap: 16,
      }}
    >
      <HugeiconsIcon icon={Loading03Icon} size={32} className="spin" color="var(--brand-500)" />
      <p style={{ color: "var(--text-secondary)", fontSize: 14, fontWeight: 500 }}>{label}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="table-container" style={{ textAlign: "center", padding: "72px 24px" }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "var(--radius-xl)",
          background: "color-mix(in srgb, var(--brand-500) 10%, transparent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
        }}
      >
        <HugeiconsIcon icon={UserMultipleIcon} size={32} color="var(--brand-500)" />
      </div>
      <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
        No customers yet
      </h3>
      <p style={{ color: "var(--text-secondary)", maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>
        As customers purchase from your store, their details and order
        history will automatically be saved here.
      </p>
    </div>
  );
}
