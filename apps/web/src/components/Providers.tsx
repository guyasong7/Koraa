"use client";

import { ThemeProvider } from "next-themes";

/**
 * What every route needs, and nothing more.
 *
 * Only the theme provider: it has to be here because `next-themes` writes the
 * class on <html> before first paint, and a marketing visitor in dark mode
 * would otherwise get a white flash.
 *
 * react-query and react-hot-toast used to be here too, which meant the landing
 * page shipped and executed 42KB of JavaScript it never called into. They live
 * in `AppProviders` now, mounted by the /dashboard, /auth and /store layouts —
 * the only places with a `useQuery` or a `toast`. Anything added here is paid
 * for by every page on the site, including the one people arrive on.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
