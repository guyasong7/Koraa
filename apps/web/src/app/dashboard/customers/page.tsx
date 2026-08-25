"use client";
import PageTitle from "@/components/PageTitle";
import { LuUsers, LuLoader } from "react-icons/lu";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/auth";

export default function CustomersPage() {
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuthStore();

  useEffect(() => {
    setTimeout(() => setIsLoading(false), 800);
  }, []);

  return (
    <>
      <PageTitle title="Customers — Koraa" />
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.02em" }}>Customers</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>Understand and manage your customer relationships.</p>
          </div>
        </div>
        
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", gap: 16 }}>
            <LuLoader size={32} className="spin" color="var(--brand-500)" />
            <p style={{ color: "var(--text-secondary)", fontSize: 14, fontWeight: 500 }}>Loading customers...</p>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "80px 20px", background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)" }}>
            <div style={{ width: 64, height: 64, borderRadius: "var(--radius-xl)", background: "rgba(168, 85, 247, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
              <LuUsers size={32} color="var(--brand-500)" />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No customers yet</h3>
            <p style={{ color: "var(--text-secondary)", maxWidth: 400, margin: "0 auto" }}>
              As customers purchase from your store, their details and order history will automatically be saved here.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
