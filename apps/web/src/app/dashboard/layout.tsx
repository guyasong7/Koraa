"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState, useEffect, Fragment } from "react";
import { useAuthStore } from "@/stores/auth";
import KoraaLogo from "@/components/KoraaLogo";
import toast from "react-hot-toast";
import {
  LuMenu, LuLayoutDashboard, LuStore, LuPackage, LuShoppingCart,
  LuUsers, LuSettings, LuLogOut, LuBell, LuGlobe, LuLoader,
  LuStar, LuChevronRight, LuZap, LuX, LuTriangleAlert
} from "react-icons/lu";
import { FiBarChart2 as LuBarChart3 } from "react-icons/fi";
import dynamic from "next/dynamic";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import AppProviders from "@/components/AppProviders";
import SessionGuard from "@/components/SessionGuard";
import UserAvatar from "@/components/UserAvatar";

/**
 * The chat bubble, out of the dashboard's initial JavaScript.
 *
 * It is a collapsed overlay that nothing else on the page measures or depends
 * on, and it brings framer-motion with it — so shipping it in the first bundle
 * delayed every dashboard page becoming interactive to render a button. Loaded
 * after hydration instead, it appears a moment later and no one is waiting.
 *
 * `ssr: false` because server-rendering it produced markup that is thrown away:
 * the widget's whole state (open, messages, streaming) is client-side, and
 * prerendering the closed bubble only adds bytes to the HTML and a hydration
 * pass to match them.
 */
const AIChatWidget = dynamic(() => import("@/components/AIChatWidget"), {
  ssr: false,
});

const NAV = [
  { label: "Overview",   href: "/dashboard",            icon: LuLayoutDashboard },
  { label: "Stores",     href: "/dashboard/stores",     icon: LuStore },
  { label: "Products",   href: "/dashboard/products",   icon: LuPackage },
  { label: "Orders",     href: "/dashboard/orders",     icon: LuShoppingCart },
  { label: "Customers",  href: "/dashboard/customers",  icon: LuUsers },
  { label: "Analytics",  href: "/dashboard/analytics",  icon: LuBarChart3 },
];

const BOTTOM = [
  { label: "Settings", href: "/dashboard/settings", icon: LuSettings },
];

/**
 * Human labels for path segments the header shows as breadcrumbs.
 *
 * Anything absent falls back to the segment with dashes turned into spaces,
 * which reads correctly for one-word routes we add later.
 */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Overview",
  stores: "Stores",
  products: "Products",
  orders: "Orders",
  customers: "Customers",
  analytics: "Analytics",
  settings: "Settings",
  billing: "Billing",
  blueprint: "Blueprint",
  seo: "SEO",
  team: "Team",
  domains: "Domains",
  notifications: "Notifications",
  "site-settings": "Site Settings",
  enquiries: "Enquiries",
  "enquiry-form": "Enquiry Form",
  new: "New",
};

/** Titles for routes where the last segment alone is not the page's name. */
const ROUTE_TITLES: Array<[RegExp, string]> = [
  [/^\/dashboard\/stores\/[^/]+\/settings$/, "Storefront Editor"],
  [/^\/dashboard\/stores\/[^/]+\/blueprint$/, "Design with Blueprint"],
  [/^\/dashboard\/stores\/[^/]+\/seo$/, "Search & SEO"],
  [/^\/dashboard\/stores\/[^/]+\/site-settings$/, "Site Settings"],
  [/^\/dashboard\/stores\/[^/]+\/enquiry-form$/, "Enquiry Form"],
  [/^\/dashboard\/stores\/[^/]+\/enquiries$/, "Enquiries"],
  [/^\/dashboard\/stores\/[^/]+$/, "Store"],
  [/^\/dashboard\/products\/new$/, "New Product"],
  [/^\/dashboard\/products\/[^/]+$/, "Product"],
  [/^\/dashboard\/stores\/new$/, "New Store"],
];

/** Ids and other opaque segments, which must not be shown as a crumb. */
const OPAQUE_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function label(segment: string) {
  return SEGMENT_LABELS[segment] ?? segment.replace(/-/g, " ");
}

/**
 * The breadcrumb trail and page title for a dashboard path.
 *
 * The header used to print only the final path segment, so every store
 * sub-page was headed by a raw uuid and nothing said where you were.
 */
function describeRoute(pathname: string): {
  crumbs: Array<{ label: string; href: string }>;
  title: string;
} {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Array<{ label: string; href: string }> = [];

  // Skip the leading "dashboard": it is the trail's root, already rendered.
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    if (OPAQUE_SEGMENT.test(segment)) continue;
    crumbs.push({
      label: label(segment),
      href: "/" + segments.slice(0, i + 1).join("/"),
    });
  }

  const matched = ROUTE_TITLES.find(([pattern]) => pattern.test(pathname));
  const title = matched?.[1] ?? crumbs[crumbs.length - 1]?.label ?? "Overview";
  return { crumbs, title };
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout, isAuthenticated, fetchMe } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !isAuthenticated) router.replace("/auth/login");
    else if (mounted && !user) fetchMe();
    else if (mounted && user && !user.has_merchant) router.replace("/auth/onboarding");
  }, [mounted, isAuthenticated, user, fetchMe, router]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const handleLogout = async () => {
    await logout();
    toast.success("Signed out");
    router.push("/auth/login");
  };

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  if (!mounted) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface)" }}>
      <LuLoader size={28} className="spin" color="var(--brand-500)" />
    </div>
  );
  if (!isAuthenticated) return null;

  const { crumbs, title } = describeRoute(pathname);

  return (
    /* The data and notification providers wrap from here rather than from the
       root layout, so the marketing pages stop shipping react-query and
       react-hot-toast; see `components/Providers.tsx`. Inside the two early
       returns above rather than around them on purpose — the loader and the
       unauthenticated `null` use neither, and everything that does (the
       breadcrumb header's NotificationBell, `handleLogout`'s toast, and every
       page passed in as `children`) is below this point. */
    <AppProviders>
      {/* Ends the session after ten idle minutes or on going offline. Here
          rather than in AppProviders, which also wraps /auth and the public
          storefronts — see components/SessionGuard.tsx. */}
      <SessionGuard />
      <div style={{ minHeight: "100vh", width: "100%" }}>

        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            onClick={() => setMobileOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 39, backdropFilter: "blur(4px)" }}
          />
        )}

        {/* ── Sidebar ── */}
        <nav className={`sidebar ${mobileOpen ? "open" : ""}`} aria-label="Main navigation">

          {/* Logo area */}
          <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <KoraaLogo className="dash-logo" />
              <button
                onClick={() => setMobileOpen(false)}
                className="mobile-menu-btn"
                style={{ display: "none", background: "var(--surface)", border: "none", borderRadius: "var(--radius-md)", padding: 6, cursor: "pointer", color: "var(--text-secondary)" }}
                aria-label="Close menu"
              >
                <LuX size={18} />
              </button>
            </div>
          </div>

          {/* Main nav */}
          <div style={{ padding: "12px 0", flex: 1, overflowY: "auto" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", padding: "6px 22px 6px", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Navigation
            </p>
            {NAV.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`sidebar-nav-item ${isActive(href) ? "active" : ""}`}
                aria-current={isActive(href) ? "page" : undefined}
              >
                <Icon size={17} className="nav-icon" />
                <span style={{ flex: 1 }}>{label}</span>
                {isActive(href) && <LuChevronRight size={13} style={{ opacity: 0.6 }} />}
              </Link>
            ))}
          </div>

          {/* Bottom area */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            {BOTTOM.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`sidebar-nav-item ${isActive(href) ? "active" : ""}`}
              >
                <Icon size={17} className="nav-icon" />
                <span>{label}</span>
              </Link>
            ))}

            {/* Upsell Cards.
                No numbers here. The limits live in `apps/merchants/plans.py`
                and this card had already drifted from them — it advertised
                "200+ products" on Starter after the real ceiling was raised.
                The Billing screen reads the catalogue live; this only has to
                get people there. */}
            {(user?.merchant_tier === "free" || !user?.merchant_tier) && (
              <div style={{ margin: "12px 16px 16px" }}>
                <Link href="/dashboard/billing" style={{
                  display: "block", borderRadius: "var(--radius-md)", textDecoration: "none",
                  background: "var(--surface)", border: "1px solid var(--border)", padding: "16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <LuStar size={16} color="var(--brand-600)" />
                    <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>Upgrade to Starter</span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45, marginBottom: 12 }}>
                    More stores, a bigger catalogue and your own domain.
                  </p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--brand-600)", borderRadius: "var(--radius-sm)", padding: "9px", fontSize: 14, fontWeight: 600, color: "white" }}>
                    <LuZap size={15} /> Upgrade
                  </div>
                </Link>
              </div>
            )}

            {user?.merchant_tier === "starter" && (
              <div style={{ margin: "12px 16px 16px" }}>
                <Link href="/dashboard/billing" style={{
                  display: "block", borderRadius: "var(--radius-md)", textDecoration: "none",
                  background: "var(--surface)", border: "1px solid var(--border)", padding: "16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <LuStar size={16} color="var(--brand-600)" />
                    <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>Upgrade to Pro</span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45, marginBottom: 12 }}>
                    Lift the store and product limits altogether.
                  </p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--brand-600)", borderRadius: "var(--radius-sm)", padding: "9px", fontSize: 14, fontWeight: 600, color: "white" }}>
                    <LuZap size={15} /> Get Pro
                  </div>
                </Link>
              </div>
            )}

            {/* Theme Toggle */}
            <div style={{ margin: "0 16px 16px" }}>
              <ThemeToggle />
            </div>

            {/* User row */}
            <div style={{ margin: "0 10px 10px", borderRadius: "var(--radius-md)", padding: "10px 12px", display: "flex", alignItems: "center", gap: 12 }}>
              <UserAvatar
                user={user}
                size={38}
                radius="var(--radius-md)"
                background="var(--brand-100)"
                color="var(--brand-700)"
                fontSize={15}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user?.full_name || "Merchant"}
                </p>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user?.email}
                </p>
              </div>
              <button
                onClick={handleLogout}
                title="Sign out"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, borderRadius: "var(--radius-sm)" }}
                className="hover-bg"
                aria-label="Sign out"
              >
                <LuLogOut size={16} />
              </button>
            </div>
          </div>
        </nav>

        {/* ── Main area ── */}
        <div className="dashboard-layout">
          {/* Header */}
          <header className="dashboard-header">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                className="mobile-menu-btn"
                onClick={() => setMobileOpen(true)}
                style={{ display: "none", background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: "var(--radius-sm)", color: "var(--text-secondary)" }}
                aria-label="Open menu"
              >
                <LuMenu size={22} />
              </button>
              {/* Breadcrumb trail, ending in the page's own title */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <Link
                  href="/dashboard"
                  style={{ fontSize: 15, color: "var(--text-muted)", fontWeight: 500, textDecoration: "none", flexShrink: 0 }}
                >
                  Koraa
                </Link>
                {crumbs.slice(0, -1).map((crumb) => (
                  <Fragment key={crumb.href}>
                    <LuChevronRight size={15} color="var(--text-disabled)" style={{ flexShrink: 0 }} />
                    <Link
                      href={crumb.href}
                      style={{ fontSize: 15, color: "var(--text-muted)", fontWeight: 500, textDecoration: "none", textTransform: "capitalize", whiteSpace: "nowrap" }}
                    >
                      {crumb.label}
                    </Link>
                  </Fragment>
                ))}
                <LuChevronRight size={15} color="var(--text-disabled)" style={{ flexShrink: 0 }} />
                <h1
                  style={{
                    fontSize: 19, fontWeight: 700, margin: 0, color: "var(--text-primary)",
                    textTransform: "capitalize", letterSpacing: "-0.01em",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}
                >
                  {title}
                </h1>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {!user?.is_verified && (
                <Link href="/dashboard/settings?tab=identity" style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
                  borderRadius: "var(--radius-md)", padding: "7px 13px", fontSize: 13, fontWeight: 600,
                  color: "#d97706", textDecoration: "none",
                }}>
                  <LuTriangleAlert size={15} /> Verify identity
                </Link>
              )}
              <NotificationBell />
              <Link href="/dashboard/settings?tab=profile" style={{ textDecoration: "none" }}>
                <div
                  style={{ cursor: "pointer", transition: "opacity 0.2s", display: "flex" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
                >
                  <UserAvatar user={user} size={38} fontSize={15} />
                </div>
              </Link>
            </div>
          </header>

          <main className="dashboard-content animate-fade-in">
            {children}
          </main>
        </div>

        {/* Floating AI Chat Widget */}
        <AIChatWidget />
      </div>
    </AppProviders>
  );
}
