"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { LuMenu, LuX } from "react-icons/lu";
import KoraaLogo from "./KoraaLogo";
import { useIsSignedIn } from "@/hooks/useIsSignedIn";

/* Only destinations that exist. /domains is a real route; the old
   /domains/search, /domains/transfer, /domains/premium, /domains/privacy
   and /contact links were 404s. */
const NAV_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "Payments", href: "/#payments" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Domains", href: "/domains" },
];

export default function LandingNavbar() {
  const signedIn = useIsSignedIn();
  const [solid, setSolid] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Transparent over the hero, solid once it would otherwise overlap content.
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // An open sheet shouldn't scroll the page behind it.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  // The sheet is opaque, so the bar has to be too while it's open.
  const barSolid = solid || menuOpen;

  return (
    <>
      <nav className={`lnav${barSolid ? " lnav--solid" : ""}`}>
        {/* The blurred plate spans the window; this puts its contents on the
            page's 1200px column so the brand lines up with the hero copy. */}
        <div className="lnav__inner">
          <Link href="/" className="lnav__brand" aria-label="Koraa home">
            <KoraaLogo className="lnav__logo" />
          </Link>

          <div className="lnav__links">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="lnav__link">
                {l.label}
                <i className="lnav__rule" aria-hidden="true" />
              </Link>
            ))}
          </div>

          <div className="lnav__actions">
            {/* "Log in" is noise once you are logged in, and so is being sent
                to a registration form. Signed in, the pair collapses to one
                button pointed at the dashboard. */}
            {!signedIn && (
              <Link href="/auth/login" className="lnav__signin">
                Log in
              </Link>
            )}
            <Link
              href={signedIn ? "/dashboard" : "/auth/register"}
              className="lnav__cta"
            >
              {signedIn ? "Dashboard" : "Open your shop"}
            </Link>

            <button
              type="button"
              className="lnav__burger"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <LuX size={26} /> : <LuMenu size={26} />}
            </button>
          </div>
        </div>
      </nav>

      {menuOpen && (
        <div className="lnav-sheet">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="lnav-sheet__link"
              onClick={() => setMenuOpen(false)}
            >
              {l.label}
            </Link>
          ))}

          <div className="lnav-sheet__actions">
            <Link
              href={signedIn ? "/dashboard" : "/auth/register"}
              className="lp-btn lp-btn--primary"
              onClick={() => setMenuOpen(false)}
            >
              {signedIn ? "Dashboard" : "Open your shop"}
            </Link>
            {!signedIn && (
              <Link
                href="/auth/login"
                className="lp-btn lp-btn--outline"
                onClick={() => setMenuOpen(false)}
              >
                Log in
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
