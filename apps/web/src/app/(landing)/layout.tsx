import Link from "next/link";
import type { Metadata } from "next";
import LandingNavbar from "@/components/LandingNavbar";
import LandingMotion from "@/components/LandingMotion";
import SmoothScroll from "@/components/SmoothScroll";
import KoraaLogo from "@/components/KoraaLogo";
import { RAILS } from "@/components/RailLogos";
import { FaFacebook, FaInstagram, FaWhatsapp, FaXTwitter } from "react-icons/fa6";
import "./landing.css";

export const metadata: Metadata = {
  title: "Koraa - Open your online shop in Cameroon",
  description:
    "Koraa gives you a storefront, a checkout that takes MTN Mobile Money and Orange Money, and one dashboard to run it all. Free to start.",
  openGraph: {
    title: "Koraa - Open your online shop in Cameroon",
    description:
      "A storefront, mobile money checkout and one dashboard to run it all. Free to start.",
    type: "website",
    locale: "en_GB",
    siteName: "Koraa",
  },
};

/* Only real destinations. Anything that would 404 has been removed
   rather than pointed at "#". */
const FOOTER_COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Payments", href: "/#payments" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Domains", href: "/domains" },
    ],
  },
  {
    heading: "Get started",
    links: [
      { label: "Open a shop", href: "/auth/register" },
      { label: "Log in", href: "/auth/login" },
      { label: "Questions", href: "/#faq" },
    ],
  },
  {
    heading: "Contact",
    links: [
      { label: "support@koraa.cm", href: "mailto:support@koraa.cm" },
      { label: "sales@koraa.cm", href: "mailto:sales@koraa.cm" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
];

/* Named because they are what the checkout actually integrates — a factual
   trust signal in the place a footer usually carries payment badges, rather
   than logos of processors we do not use. The marks come from
   `RailLogos.tsx`, which is also what the payments section and the checkout
   illustration draw from. */

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* The hero's opening states live in CSS, not in JS, so the copy cannot
          be painted at full size and then yanked back to animate. That means
          it has to be un-hidden for anyone whose GSAP will never run — this is
          the only reliable way to do it without a blocking script, and
          `next/script`'s beforeInteractive is documented as root-layout-only,
          which this is not. */}
      <noscript>
        <style>{`[data-hero],[data-draw],[data-rise],.lnav__logo path{opacity:1!important;transform:none!important}.lp-mark{--frame-o:1}`}</style>
      </noscript>

      <LandingNavbar />
      <SmoothScroll />
      <LandingMotion />
      <main>{children}</main>

      <footer className="lfoot">
        <div className="lp-wrap">
          <div className="lfoot__grid">
            <div className="lfoot__brand">
              <Link href="/" aria-label="Koraa home" className="lfoot__home">
                <KoraaLogo className="lfoot__logo" />
              </Link>
              <p className="lfoot__blurb">
                A Cameroonian commerce platform. Koraa gives small businesses a
                storefront, a checkout that takes mobile money, and one place to
                run both.
              </p>
              <div className="lfoot__rails">
                <h2 className="lfoot__rails-label" id="lfoot-rails">
                  Payments accepted
                </h2>
                <ul aria-labelledby="lfoot-rails">
                  {RAILS.map(({ label, Logo }) => (
                    <li key={label}>
                      <Logo className="lfoot__rail-logo" decorative />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {FOOTER_COLUMNS.map((col) => {
              const id = `lfoot-${col.heading.replace(/\s+/g, "-").toLowerCase()}`;
              return (
                <nav key={col.heading} aria-labelledby={id} className="lfoot__col">
                  <h2 id={id}>{col.heading}</h2>
                  <ul>
                    {col.links.map((l) => (
                      <li key={l.href}>
                        {l.href.startsWith("mailto:") ? (
                          <a href={l.href}>{l.label}</a>
                        ) : (
                          <Link href={l.href}>{l.label}</Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </nav>
              );
            })}
          </div>

          <div className="lfoot__bottom">
            <div className="lfoot__bottom-text">
              <span>
                &copy; {new Date().getFullYear()} Koraa. All rights reserved.
              </span>
              <span>Priced and billed in CFA francs, once a year.</span>
            </div>
            <div className="lfoot__socials">
              <a href="https://facebook.com" aria-label="Facebook" target="_blank" rel="noopener noreferrer">
                <FaFacebook size={20} />
              </a>
              <a href="https://instagram.com" aria-label="Instagram" target="_blank" rel="noopener noreferrer">
                <FaInstagram size={20} />
              </a>
              <a href="https://whatsapp.com" aria-label="WhatsApp" target="_blank" rel="noopener noreferrer">
                <FaWhatsapp size={20} />
              </a>
              <a href="https://twitter.com" aria-label="X (Twitter)" target="_blank" rel="noopener noreferrer">
                <FaXTwitter size={20} />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
