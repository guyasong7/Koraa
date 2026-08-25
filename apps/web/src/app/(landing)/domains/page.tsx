"use client";

import { useState, useEffect, useRef, useId } from "react";
import Link from "next/link";
import {
  LuSearch,
  LuCheck,
  LuX,
  LuShoppingCart,
  LuGlobe,
  LuArrowUpRight,
  LuStar,
  LuShield,
  LuZap,
} from "react-icons/lu";
import { gsap } from "gsap";

const EXTENSIONS = [".com", ".africa", ".shop", ".store", ".co", ".net", ".org", ".io"];

const PREMIUM_DOMAINS = [
  { name: "marketplace.africa", price: "125,000", badge: "Premium" },
  { name: "shop.cm", price: "45,000", badge: "Popular" },
  { name: "boutique.africa", price: "89,000", badge: "Premium" },
  { name: "commerce.africa", price: "210,000", badge: "Exclusive" },
];

const FEATURES = [
  {
    icon: LuShield,
    title: "Free WHOIS privacy",
    desc: "Your personal details stay out of the public WHOIS database at no extra cost.",
  },
  {
    icon: LuZap,
    title: "Instant activation",
    desc: "Point a domain at your storefront and it resolves in minutes, not days.",
  },
  {
    icon: LuGlobe,
    title: "DNS you control",
    desc: "Full record management from your Koraa dashboard — no registrar login needed.",
  },
];

type SearchResult = {
  domain: string;
  available: boolean;
  price: string;
  extension: string;
};

function generateResults(query: string, ext: string): SearchResult[] {
  if (!query.trim()) return [];
  const base = query.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const prices: Record<string, string> = {
    ".com": "8,500",
    ".africa": "12,000",
    ".shop": "15,000",
    ".store": "14,000",
    ".co": "11,000",
    ".net": "9,000",
    ".org": "8,000",
    ".io": "22,000",
  };
  const extensions = ext === "all" ? EXTENSIONS : [ext];
  return extensions.map((e, i) => ({
    domain: `${base}${e}`,
    extension: e,
    available: i !== 1 && Math.random() > 0.3,
    price: prices[e] ?? "10,000",
  }));
}

export default function DomainsPage() {
  const [query, setQuery] = useState("");
  const [ext, setExt] = useState("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [cart, setCart] = useState<string[]>([]);
  const heroRef = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const extId = useId();

  useEffect(() => {
    if (!heroRef.current) return;
    // Respect the OS setting — gsap has no equivalent of framer's useReducedMotion,
    // so check the media query directly and skip straight to the end state.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".anim",
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, stagger: 0.09, duration: 0.6, ease: "power3.out" }
      );
    }, heroRef);
    return () => ctx.revert();
  }, []);

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    setTimeout(() => {
      setResults(generateResults(query, ext));
      setLoading(false);
    }, 900);
  };

  const toggleCart = (domain: string) => {
    setCart((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  };

  return (
    <div className="dm">
      {/* ── Hero + search ── */}
      <section className="dm-hero" ref={heroRef}>
        <div className="lp-wrap">
          <div className="dm-hero__inner">
            <p className="lp-eyebrow anim">Domain names</p>
            <h1 className="lp-display lp-h1 anim">Find your perfect domain name</h1>
            <p className="dm-hero__sub anim">
              Secure your corner of the internet. Search .africa, .com, .shop and more —
              then point it at a Koraa storefront in a couple of clicks.
            </p>

            <form className="dm-search anim" onSubmit={handleSearch} role="search">
              {/* Both controls carry a real label. The old build relied on the
                  placeholder alone, which disappears the moment you type. */}
              <label className="lp-sr-only" htmlFor={searchId}>
                Domain name to search for
              </label>
              <label className="lp-sr-only" htmlFor={extId}>
                Limit search to one extension
              </label>

              <span className="dm-search__icon" aria-hidden="true">
                <LuSearch size={20} strokeWidth={2} />
              </span>
              <input
                id={searchId}
                className="dm-search__input"
                name="domain"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="mybrand, mystore…"
                autoComplete="off"
                spellCheck={false}
              />
              <select
                id={extId}
                className="dm-search__ext"
                value={ext}
                onChange={(e) => setExt(e.target.value)}
              >
                <option value="all">All extensions</option>
                {EXTENSIONS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
              <button className="dm-search__submit" type="submit">
                Search
              </button>
            </form>

            <div className="dm-chips anim">
              {EXTENSIONS.slice(0, 5).map((e) => (
                <button
                  key={e}
                  type="button"
                  className="dm-chip"
                  aria-pressed={ext === e}
                  onClick={() => setExt(ext === e ? "all" : e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Results ── */}
      <section className="lp-section">
        <div className="lp-wrap">
          <div className="dm-body">
            {loading && (
              <div className="dm-state" role="status">
                <div className="dm-spinner" aria-hidden="true" />
                <p>Checking availability…</p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <div>
                <div className="dm-results__head">
                  <h2 className="lp-display lp-h2">
                    Results for <span className="dm-results__q">{query}</span>
                  </h2>
                  {cart.length > 0 && (
                    <button type="button" className="lp-btn lp-btn--primary">
                      <LuShoppingCart size={16} strokeWidth={2} aria-hidden="true" />
                      Checkout ({cart.length})
                    </button>
                  )}
                </div>

                <div className="dm-rows">
                  {results.map((r) => (
                    <div
                      key={r.domain}
                      className={`dm-row${r.available ? "" : " dm-row--taken"}`}
                    >
                      <div className="dm-row__id">
                        <span className="dm-row__mark" aria-hidden="true">
                          {r.available ? (
                            <LuCheck size={16} strokeWidth={2} />
                          ) : (
                            <LuX size={16} strokeWidth={2} />
                          )}
                        </span>
                        <div>
                          <div className="dm-row__name">{r.domain}</div>
                          {/* Text, not just colour — the icon and the word agree. */}
                          <div
                            className={`dm-row__status dm-row__status--${
                              r.available ? "free" : "taken"
                            }`}
                          >
                            {r.available ? "Available" : "Taken"}
                          </div>
                        </div>
                      </div>

                      <div className="dm-row__end">
                        {r.available ? (
                          <>
                            <div className="dm-row__price">
                              {r.price} <span className="dm-row__unit">XAF/yr</span>
                            </div>
                            <button
                              type="button"
                              className={`lp-btn ${
                                cart.includes(r.domain)
                                  ? "lp-btn--ghost"
                                  : "lp-btn--primary"
                              }`}
                              onClick={() => toggleCart(r.domain)}
                            >
                              {cart.includes(r.domain) ? "Remove" : "Add to cart"}
                            </button>
                          </>
                        ) : (
                          <button type="button" className="lp-btn lp-btn--ghost" disabled>
                            Unavailable
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loading && results.length === 0 && (
              <div className="dm-state">
                <LuGlobe
                  size={40}
                  strokeWidth={1.5}
                  className="dm-state__icon"
                  aria-hidden="true"
                />
                <h3 className="lp-display lp-h3">Search for your domain above</h3>
                <p>
                  Type any name and we&apos;ll check availability across every extension we
                  sell.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Premium ── */}
      <section className="lp-section lp-section--tight">
        <div className="lp-wrap">
          <div className="dm-body">
            <div className="dm-sec-head">
              <LuStar size={18} strokeWidth={2} aria-hidden="true" />
              <h2 className="lp-display lp-h3">Premium domains</h2>
            </div>
            <div className="dm-premium">
              {PREMIUM_DOMAINS.map((d) => (
                <div className="dm-prem" key={d.name}>
                  <div>
                    <div className="dm-prem__name">{d.name}</div>
                    <span className="lp-tag">{d.badge}</span>
                  </div>
                  <div className="dm-prem__end">
                    <div className="dm-prem__price">
                      {d.price} <span className="dm-row__unit">XAF</span>
                    </div>
                    <button type="button" className="lp-btn lp-btn--ghost lp-btn--sm">
                      Enquire
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── What comes with every domain ── */}
      <section className="lp-section dm-features">
        <div className="lp-wrap">
          <h2 className="lp-display lp-h2 lp-center">
            Everything you need with every domain
          </h2>
          <div className="dm-feature-grid">
            {FEATURES.map((f) => (
              <div className="dm-feature" key={f.title}>
                <span className="dm-feature__icon" aria-hidden="true">
                  <f.icon size={20} strokeWidth={2} />
                </span>
                <h3 className="lp-display lp-h3">{f.title}</h3>
                <p className="lp-body">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-section lp-center">
        <div className="lp-wrap">
          <h2 className="lp-display lp-h2">Ready to launch your store?</h2>
          <p className="lp-lede">
            Pair your new domain with a Koraa storefront and go live today.
          </p>
          <Link href="/auth/register" className="lp-btn lp-btn--primary lp-btn--lg">
            Get started free
            <LuArrowUpRight size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
