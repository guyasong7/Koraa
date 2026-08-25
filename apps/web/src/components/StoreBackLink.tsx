"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LuArrowLeft } from "react-icons/lu";

/**
 * "Back to store" link for pages reached from a store's manage section.
 *
 * The manage grid on `/dashboard/stores/[id]` links out to the *global*
 * Products, Orders and Analytics pages with `?store=<id>` appended, so those
 * pages are shared between "all stores" and "one store" browsing. Arriving
 * with that param left no way back other than the browser button.
 *
 * Pass `storeId` on pages that already know it from the route (a store's own
 * sub-pages); omit it on the global pages and `?store=` is read instead, so the
 * link is absent when the page was not opened from a store.
 */
export default function StoreBackLink({
  storeId,
  label = "Back to store",
}: {
  storeId?: string;
  label?: string;
}) {
  // Only reach for the search params when the caller cannot supply the id.
  // Reading them suspends, so the boundary keeps pages that are otherwise
  // statically rendered (Orders, Analytics) from failing to prerender.
  if (storeId) return <BackLink storeId={storeId} label={label} />;
  return (
    <Suspense fallback={null}>
      <ParamBackLink label={label} />
    </Suspense>
  );
}

function ParamBackLink({ label }: { label: string }) {
  const storeId = useSearchParams().get("store");
  if (!storeId) return null;
  return <BackLink storeId={storeId} label={label} />;
}

function BackLink({ storeId, label }: { storeId: string; label: string }) {
  return (
    <Link
      href={`/dashboard/stores/${storeId}`}
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
      <LuArrowLeft size={15} /> {label}
    </Link>
  );
}
