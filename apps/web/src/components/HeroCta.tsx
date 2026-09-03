"use client";

import Link from "next/link";
import { LuArrowRight } from "react-icons/lu";

import { useIsSignedIn } from "@/hooks/useIsSignedIn";

/**
 * The landing page's primary call to action, pointed at wherever the visitor
 * actually needs to go.
 *
 * A signed-in merchant being invited to "Open a shop" is being sent to a
 * registration form they have already filled in. This is its own client
 * component so that `(landing)/page.tsx` stays a server component and the
 * pricing table keeps server-rendering with the real prices.
 */
export default function HeroCta({ className }: { className: string }) {
  const signedIn = useIsSignedIn();

  return (
    <Link href={signedIn ? "/dashboard" : "/auth/register"} className={className}>
      {signedIn ? "Dashboard" : "Open a shop"}
      <LuArrowRight size={18} aria-hidden="true" />
    </Link>
  );
}
