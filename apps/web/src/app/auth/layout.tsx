import type { ReactNode } from "react";
import AuthPreconnect from "./_preconnect";

/**
 * Exists only to hang the resource hints on every /auth route from one place.
 *
 * Deliberately renders no markup of its own: the pages under here already own
 * their full-page shells (`.auth-split-shell`, `.auth-container`), and a
 * wrapper element would sit between those and the body and break their
 * height maths.
 *
 * A layout rather than a call in each page so a route added later gets the
 * hints without anyone remembering to add them.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthPreconnect />
      {children}
    </>
  );
}
