"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useTheme } from "next-themes";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle02Icon,
  CancelCircleIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";

/**
 * The data and notification providers, for the routes that actually use them.
 *
 * Split out of `Providers` so the marketing pages stop paying for them. The
 * root layout wraps every route, and react-query plus the toast library are
 * JavaScript that the landing page and /domains never call into — measured:
 * no `useQuery`, `useMutation` or `toast` anywhere in their component trees.
 * On the landing route that JavaScript was pure cost, parsed and executed
 * before the page could become interactive.
 *
 * Every consumer lives under /dashboard, /auth or /store, so those three
 * layouts mount this and the marketing routes are left with the theme
 * provider alone.
 *
 * The QueryClient is held in `useState` rather than created at module scope on
 * purpose: a module-level client is shared between requests on the server, so
 * one visitor's cached queries would be served to the next.
 */
export default function AppProviders({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, retry: 1 },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Carries over the previous toast styling exactly: square corners, a
          surface-900 panel on a 1px border, 14px type. `theme` is handed the
          resolved next-themes value because sonner otherwise assumes light
          and would paint its own close button and default text against a
          dark panel. Icons are supplied rather than left to sonner's
          defaults so they use Koraa's brand/danger tokens.

          Success toasts keep their old 2s lifetime via `@/lib/toast` — this
          `toastOptions.duration` is global in sonner and cannot express a
          per-type default. `expand` is set because sonner otherwise collapses
          concurrent toasts into a stack, where the previous library listed
          them. The one remaining difference is sonner's cap of 3 visible at
          once; nothing here raises more than a couple. */}
      <Toaster
        position="top-right"
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        expand
        toastOptions={{
          style: {
            background: "var(--surface-900)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            fontSize: "14px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          },
        }}
        icons={{
          success: (
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              size={18}
              className="text-brand-500"
            />
          ),
          error: (
            <HugeiconsIcon
              icon={CancelCircleIcon}
              size={18}
              className="text-danger"
            />
          ),
          loading: (
            <HugeiconsIcon
              icon={Loading03Icon}
              size={18}
              className="spin-fast text-text-muted"
            />
          ),
        }}
      />
    </QueryClientProvider>
  );
}
