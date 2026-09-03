"use client";

import { useEffect, useState } from "react";

import { useAuthStore } from "@/stores/auth";

/**
 * Whether there is a session, safe to call from prerendered markup.
 *
 * `useAuthStore`'s `isAuthenticated` initialiser reads localStorage at module
 * scope (`stores/auth.ts:17-19`), so on the server it is always false while in
 * the browser it may be true — reading it during the first render makes the
 * client's output disagree with the HTML, which React reports as a hydration
 * mismatch and resolves by throwing the server tree away.
 *
 * So this returns false until after mount, whatever the store says. The
 * signed-out markup is what prerenders, and the swap happens in the second
 * render — the same `mounted` gate `dashboard/layout.tsx` uses.
 *
 * The consequence worth knowing: signed-in visitors see the signed-out label
 * for one frame. On the landing page that is the right trade, because the
 * alternative is either no prerendered CTA at all or a mismatch.
 */
export function useIsSignedIn(): boolean {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return mounted && isAuthenticated;
}
