"use client";

/**
 * The pricing table, with the monthly/yearly view toggle.
 *
 * ── Why a client component does not cost the server-rendered prices ──
 *
 * `page.tsx` fetches `/payments/plans/` so the real numbers land in the
 * HTML instead of appearing after hydration. That still holds here: a
 * `"use client"` boundary marks a component as *hydrated*, not as
 * client-only, so Next renders this on the server for the initial
 * response exactly as before. The prices are in the markup; the toggle is
 * the only thing waiting on JavaScript, and it defaults to the view that
 * matches what is actually sold.
 *
 * ── Why the toggle shows two real prices ──
 *
 * Both cycles are on sale — `PURCHASABLE_CYCLES` takes either — so each view
 * names a price a merchant can actually be charged, and both come from the
 * catalogue rather than being derived here. This page has form on that: it
 * once advertised "5,000 XAF/month" tiers the backend refused to sell, which
 * is the drift `lib/planCopy` was created to stop. The fix then was a
 * disclosure saying the charge was really annual; the fix now is that the
 * sentence is simply true, because monthly is a term you can buy.
 *
 * The line under the amount still earns its place, and still must not be
 * dropped to tidy the card up — it is now what makes the *choice* legible
 * rather than what makes a number honest. On yearly it names the per-month
 * equivalence, so the headline annual figure reads as a rate. On monthly it
 * names the annual alternative, so the merchant paying more per month can see
 * what committing would have saved. Two views of one ladder, neither hiding
 * the other.
 */

import { useState } from "react";
import Link from "next/link";
import { LuCheck } from "react-icons/lu";

import type { PlanCatalogueEntry } from "@/lib/api";
import { useIsSignedIn } from "@/hooks/useIsSignedIn";
import {
  CONTACT_SALES_PLAN,
  POPULAR_PLAN,
  formatXaf,
  monthlyEquivalent,
  planCardBullets,
} from "@/lib/planCopy";

/** Which price the table is currently showing. */
type View = "monthly" | "yearly";

export function PricingPlans({
  plans,
  universal,
}: {
  plans: PlanCatalogueEntry[];
  universal: Array<{ key: string; label: string }>;
}) {
  /* Yearly leads, matching the catalogue's `default_billing_cycle`. Both
     cycles sell, so this is no longer about only one being real — it is that
     opening on monthly would put the smaller number first and the saving
     second, which is the trick this page is deliberately not playing. */
  const [view, setView] = useState<View>("yearly");
  const monthly = view === "monthly";
  const signedIn = useIsSignedIn();

  return (
    <>
      {/* Two radios rather than a checkbox or a switch: the choice is
          between two named views, and a screen reader should hear which
          one is current, not "toggle, off". */}
      <div
        className="lp-cycle"
        role="radiogroup"
        aria-label="Show prices per month or per year"
      >
        {(["monthly", "yearly"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={view === option}
            className="lp-cycle__opt"
            data-on={view === option ? "" : undefined}
            onClick={() => setView(option)}
          >
            {option === "monthly" ? "Monthly" : "Yearly"}
            {option === "yearly" ? (
              <span className="lp-cycle__save">2 months free</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="lp-plans">
        {plans.map((plan) => {
          const featured = plan.key === POPULAR_PLAN;
          /* Enterprise is sold by conversation: `InitiatePaymentView`
             will not charge for it, so a "Choose" button here would
             send people to a dead end. */
          const contact = plan.key === CONTACT_SALES_PLAN;
          const free = plan.price_yearly === 0;

          // Where this plan's button goes. A merchant who is already signed in
          // does not need to register to pick a plan — Billing is where the
          // same choice is actually made, and the free tier is the one they are
          // already on, so it points at the dashboard itself.
          const ctaHref = !signedIn
            ? "/auth/register"
            : free
              ? "/dashboard"
              : "/dashboard/billing";
          const ctaLabel = free
            ? signedIn
              ? "Go to your dashboard"
              : "Open a shop"
            : `Choose ${plan.name}`;

          return (
            <div
              key={plan.key}
              className={featured ? "lp-plan lp-plan--featured" : "lp-plan"}
            >
              <p className="lp-plan__badge">
                {featured ? "Most popular" : null}
              </p>
              <h3 className="lp-plan__name">{plan.name}</h3>
              <p className="lp-plan__for">{plan.tagline}</p>

              <div className="lp-plan__price">
                {free ? (
                  <span className="lp-plan__amount">Free</span>
                ) : (
                  <>
                    <span className="lp-plan__amount">
                      {monthly
                        ? formatXaf(plan.price_monthly)
                        : formatXaf(plan.price_yearly)}
                    </span>
                    <span className="lp-plan__unit">
                      {monthly ? "XAF/month" : "XAF/year"}
                    </span>
                  </>
                )}
              </div>

              {/* The other cycle, on both views, so neither price is shown
                  without the alternative beside it. On yearly that is the
                  per-month equivalence; on monthly it is the annual figure
                  and what committing to it saves. */}
              <p className="lp-plan__billed">
                {free
                  ? "No card, no expiry"
                  : monthly
                    ? `Or ${formatXaf(plan.price_yearly)} XAF a year, two months free`
                    : `About ${monthlyEquivalent(plan.price_yearly)} XAF a month`}
              </p>

              <ul className="lp-plan__features">
                {planCardBullets(plan, plans).map((bullet) => (
                  <li key={bullet}>
                    <LuCheck size={15} aria-hidden="true" />
                    {bullet}
                  </li>
                ))}
              </ul>

              {contact ? (
                <a
                  href="mailto:sales@koraa.cm?subject=Enterprise Plan Enquiry"
                  className="lp-btn lp-btn--outline"
                >
                  Talk to sales
                </a>
              ) : (
                <Link
                  href={ctaHref}
                  className={
                    featured ? "lp-btn lp-btn--on-ink" : "lp-btn lp-btn--outline"
                  }
                >
                  {ctaLabel}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {universal.length > 0 && (
        <div className="lp-trust">
          <span>Included on every plan:</span>
          {universal.map((f) => (
            <span key={f.key}>
              <LuCheck size={16} aria-hidden="true" />
              {f.label}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
