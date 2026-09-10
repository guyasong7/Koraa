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
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            {/* Font and line-height come from the global `h1` rule; these
                utilities only restate what the old inline style overrode. */}
            <h1 className="mb-1 text-2xl font-extrabold tracking-[-0.02em] sm:text-[28px]">
              Customers
            </h1>
            <p className="text-[15px] text-text-secondary">
              Understand and manage your customer relationships.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
            <HugeiconsIcon
              icon={Loading03Icon}
              size={32}
              className="spin-fast text-brand-500"
            />
            <p className="text-sm font-medium text-text-secondary">
              Loading customers…
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface-900 px-5 py-14 text-center shadow-e2 sm:py-20">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--brand-500)_10%,transparent)]">
              <HugeiconsIcon
                icon={UserMultipleIcon}
                size={32}
                className="text-brand-500"
              />
            </div>
            <h3 className="mb-2 text-xl font-bold">No customers yet</h3>
            <p className="mx-auto max-w-[400px] text-text-secondary">
              As customers purchase from your store, their details and order
              history will automatically be saved here.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
