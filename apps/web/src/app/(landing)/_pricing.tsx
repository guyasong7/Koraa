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
 * ── Why the toggle is a view, not a purchase option ──
 *
 * Koraa bills annually and only annually. `PURCHASABLE_CYCLES` rejects
 * `billing_cycle=monthly` with a 400, and this page has form: it once
 * advertised "5,000 XAF/month" tiers the backend refused to sell, which
 * is the drift `lib/planCopy` was created to stop. So the monthly view
 * names the monthly rate the annual price is built from and, in the same
 * breath, says what will actually be charged. The disclosure under the
 * amount is load-bearing — it is the difference between a discount
 * expressed per month and a plan we do not sell. Do not drop it to tidy
 * the card up.
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
  monthlyRate,
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
  /* Yearly is the default because yearly is the thing on sale. Opening on
     the monthly view would put the smaller number first and the terms
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
                        ? monthlyRate(plan.price_yearly)
                        : formatXaf(plan.price_yearly)}
                    </span>
                    <span className="lp-plan__unit">
                      {monthly ? "XAF/month" : "XAF/year"}
                    </span>
                  </>
                )}
              </div>

              {/* The terms, on both views. On the yearly view this is the
                  discount made concrete; on the monthly view it is the
                  disclosure that keeps the smaller number honest. */}
              <p className="lp-plan__billed">
                {free
                  ? "No card, no expiry"
                  : monthly
                    ? `Billed annually as ${formatXaf(plan.price_yearly)} XAF`
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
