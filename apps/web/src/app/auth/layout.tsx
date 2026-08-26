import type { ReactNode } from "react";
import AppProviders from "@/components/AppProviders";
import AuthPreconnect from "./_preconnect";

/**
 * Exists to hang the resource hints, and the data and notification providers,
 * on every /auth route from one place.
 *
 * Deliberately renders no markup of its own: the pages under here already own
 * their full-page shells (`.auth-split-shell`, `.auth-container`), and a
 * wrapper element would sit between those and the body and break their
 * height maths.
 *
 * A layout rather than a call in each page so a route added later gets the
 * hints without anyone remembering to add them.
 *
 * `AppProviders` is here rather than in the root layout so the marketing pages
 * stop shipping react-query and react-hot-toast; see `components/Providers.tsx`.
 * Every /auth page raises toasts on a failed sign-in, so all of them need it.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <AuthPreconnect />
      {children}
    </AppProviders>
  );
}
