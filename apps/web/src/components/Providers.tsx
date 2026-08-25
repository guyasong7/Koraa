"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useState } from "react";



import { ThemeProvider } from "next-themes";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, retry: 1 },
        },
      })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
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
    </ThemeProvider>
  );
}
