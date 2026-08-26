"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useState } from "react";

/**
 * The data and notification providers, for the routes that actually use them.
 *
 * Split out of `Providers` so the marketing pages stop paying for them. The
 * root layout wraps every route, and react-query plus react-hot-toast are
 * 42KB of JavaScript (13.7KB gzipped) that the landing page and /domains never
 * call into — measured: no `useQuery`, `useMutation` or `toast` anywhere in
 * their component trees. On the landing route that JavaScript was pure cost,
 * parsed and executed before the page could become interactive.
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
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "var(--surface-900)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            fontSize: "14px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          },
          success: {
            iconTheme: { primary: "var(--brand-500)", secondary: "var(--surface-900)" },
          },
          error: {
            iconTheme: { primary: "var(--danger)", secondary: "var(--surface-900)" },
          },
        }}
      />
    </QueryClientProvider>
  );
}
