"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Loading03Icon,
} from "@hugeicons/core-free-icons";

export default function StorefrontEditorRedirect() {
  const router = useRouter();

  useEffect(() => {
    // The storefront editor is now per-store at /dashboard/stores/[id]/settings
    // Redirect merchants to manage their stores
    router.replace("/dashboard/stores");
  }, [router]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <HugeiconsIcon icon={Loading03Icon} size={32} className="spin" color="var(--brand-500)" style={{ margin: "0 auto 16px" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>Redirecting to stores…</p>
      </div>
    </div>
  );
}
