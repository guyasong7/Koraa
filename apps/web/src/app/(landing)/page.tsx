import Link from "next/link";
import Image from "next/image";
import {
  LuArrowRight,
  LuChartLine,
  LuCheck,
  LuGlobe,
  LuLock,
  LuPalette,
  LuReceipt,
  LuSmartphone,
  LuUpload,
} from "react-icons/lu";

import { getPlanCatalogue } from "@/lib/api";
import KoraaLogo from "@/components/KoraaLogo";
import { RAILS } from "@/components/RailLogos";
import { universalFeatures, FALLBACK_PLANS } from "@/lib/planCopy";

import { FaqItem, Reveal } from "./_ui";
import { PricingPlans } from "./_pricing";

/**
 * Marketing home page.
 *
 * A server component on purpose: the pricing table comes from
 * `/payments/plans/`, and fetching it here puts the real prices in the HTML
 * instead of leaving a gap until hydration. `_ui.tsx` holds the two pieces
 * that need state.
 *
 * Nothing here states a price, a limit or a feature of its own. The table
 * below used to advertise a "Scale" tier at 15,000 XAF/month and a 14-day
 * trial, neither of which exists in `merchants/plans.py` — every number and
 * bullet is now derived from the catalogue through `lib/planCopy`, so the
 * page cannot promise something the backend will refuse to sell.
 *
 * Metadata and the nav and footer chrome come from `layout.tsx`.
 */

/* The three cells under the hero. Facts about what Koraa is, not metrics
   about how many people use it — the previous version claimed 10,000
   merchants and five named brands, none of which we can point at. */
const FACTS = [
  {
    value: "Free",
    label:
      "One shop, 50 products and mobile money checkout, with no card and no expiry.",
  },
  {
    value: "Mobile money payments",
    label: "MTN Mobile Money and Orange Money, taken at your checkout.",
  },
  {
    value: "XAF",
    label: "Priced and billed in CFA francs, once a year.",
  },
  {
    value: "100% uptime",
    label: "Your store stays live around the clock, every day of the year.",
  },
];

/* The hero's two photo columns, from Unsplash. Shopkeepers, market
   traders and makers — several of them holding the phone the payment
   arrives on. The point of putting people here rather than a screenshot
   of the dashboard is that the dashboard is not what anyone is buying.

   Each column is rendered twice so the marquee can loop without a seam:
   scrolling exactly half the column's height puts copy two where copy
   one started. Four per column, so the loop is long enough not to read
   as a repeat. */
const HERO_MOSAIC = [
  [
    "/images/shop-phone-fruit.jpg",
    "/images/goods-bags.jpg",
    "/images/apron-phone.jpg",
    "/images/market-bananas.jpg",
  ],
  [
    "/images/shop-counter.jpg",
    "/images/tailor-machine.jpg",
    "/images/shop-front.jpg",
    "/images/market-tomatoes.jpg",
  ],
];

/* Only capabilities that exist in the codebase today. */
const FEATURES = [
  {
    icon: LuPalette,
    title: "Storefront editor",
    body: "Choose a template, then change the type, colours and sections with a live preview beside you.",
  },
  {
    icon: LuGlobe,
    title: "Your own domain",
    body: "Point a domain you already own at your shop, or search for and register a new one.",
  },
  {
    icon: LuSmartphone,
    title: "Mobile money checkout",
    body: "Customers pay with MTN Mobile Money or Orange Money and confirm it on their handset.",
  },
  {
    icon: LuUpload,
    title: "Catalogue and CSV import",
    body: "Bring an existing product list in as a spreadsheet, and export it again whenever you want it back.",
  },
  {
    icon: LuChartLine,
    title: "Analytics",
    body: "Visitors, orders and revenue over time, so you can see which products and which days are working.",
  },
  {
    icon: LuReceipt,
    title: "Invoices and downloads",
    body: "Every paid order emails an invoice. Sell digital files and the download links go out with it.",
  },
];

const PAYMENT_POINTS = [
  {
    title: "Paid before it ships",
    body: "The order is confirmed once the payment clears, so you are not packing goods against a promise.",
  },
  {
    title: "No card needed, on either side",
    body: "Your customers pay from the mobile money wallet they already use, and you are billed the same way.",
  },
  {
    title: "Payout account in your name",
    body: "Set the MTN or Orange number your money settles to, and change it from the dashboard.",
  },
];

/* Answers checked against the code that enforces them — plans.py for the
   allowances, PURCHASABLE_CYCLES for the billing cycle, and
   payments.lifecycle for what expiry actually does. */
const FAQS = [
  {
    q: "What do I get without paying?",
    a: "One shop with up to 50 products and one staff account, two storefront templates, a month of analytics history, and your own domain if you have one. Mobile money checkout, the storefront editor and emailed invoices are on the free plan too — they are not held back for paid tiers.",
  },
  {
    q: "How is Koraa billed?",
    a: "Once a year, in CFA francs, by MTN Mobile Money or Orange Money. There is no monthly plan to buy — the monthly view in the pricing table above is the same annual price divided out, shown per month so it is easier to compare. The annual price is set at ten months rather than twelve, so a year costs less than paying month to month would, and a yearly term is what lets us charge nothing for the free plan.",
  },
  {
    q: "What happens when my plan runs out?",
    a: "Your storefronts stay online and nothing is deleted. The account goes back to the free allowances until you renew, and renewing restores them immediately. Renewing early adds a year to the term you already have rather than replacing it.",
  },
  {
    q: "Can I use a domain I already own?",
    a: "Yes, on every plan including the free one. Connect a domain you already have, or search for and register a new one from the domains page.",
  },
  {
    q: "How do my customers pay?",
    a: "At checkout they choose MTN Mobile Money or Orange Money, enter their number, and approve the payment on their phone. They do not need a Koraa account to buy from you.",
  },
];

export default async function LandingPage() {
  const catalogue = await getPlanCatalogue();
  /* When the backend is unreachable (build time, dev without a running
     server) we fall back to the static copy of plans.py rather than
     hiding the pricing table. FALLBACK_PLANS must stay in sync with
     merchants/plans.py — see lib/planCopy.ts. */
  const plans = catalogue?.plans ?? FALLBACK_PLANS;
  /* Derived, not listed: a feature that stops being on every tier drops out
     of this row by itself. */
  const universal = universalFeatures(plans);

  return (
    <div className="lp">
      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="lp-hero">
        {/* The wave from the logo, oversized and hairline, drawn in by
            DrawSVGPlugin. Decorative: the same mark is already announced by the
            nav's logo, so a second "Koraa" here would only be noise. */}
        <KoraaLogo
          variant="outline"
          decorative
          strokeWidth={1.5}
          className="lp-hero__flourish"
          data-draw="flourish"
        />

        <div className="lp-hero__inner">
          <div className="lp-wrap">
            <div className="lp-hero__copy">
              <h1 className="lp-display lp-h1" data-hero="h1">
                No hide your business, put am{" "}
                <span className="lp-mark">online</span>
              </h1>
              <p className="lp-hero__sub" data-hero="sub">
                Koraa gives you a storefront, a checkout your customers pay
                from their phone, and one dashboard to run both.
              </p>
              <div className="lp-hero__actions" data-hero="actions">
                <Link
                  href="/auth/register"
                  className="lp-btn lp-btn--primary lp-btn--lg"
                >
                  Open a shop
                  <LuArrowRight size={18} aria-hidden="true" />
                </Link>
                <Link href="#pricing" className="lp-btn lp-btn--outline lp-btn--lg">
                  See pricing
                </Link>
              </div>

              {/* The networks by their own marks. Naming them in the sub, as
                  it used to, spends a clause of the one paragraph anybody
                  reads on something a merchant recognises faster from the
                  lockups — so the sentence got shorter and the marks moved
                  here. Each `Logo` labels itself, so the list needs no
                  visually-hidden text of its own. */}
              <div className="lp-hero__rails" data-hero="rails">
                <span className="lp-hero__rails-label">Customers pay with</span>
                <ul className="lp-hero__rails-list">
                  {RAILS.map(({ label, Logo }) => (
                    <li key={label} className="lp-hero__rail">
                      <Logo className="lp-hero__rail-logo" />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Two columns of photographs, offset from each other and bleeding
            off the top and bottom of the section — .lp-hero's overflow does
            the cropping, so they read as a strip continuing past the edge
            rather than as a gallery that happens to end.

            Hidden from assistive tech, and every alt is empty: the images
            carry atmosphere, not information, and they are each rendered
            twice for the loop. A screen reader reading eight market stalls
            out twice is noise. */}
        <div className="lp-hero__mosaic" data-hero="mosaic" aria-hidden="true">
          {HERO_MOSAIC.map((column, i) => (
            <div key={i} className="lp-hero__col">
              {[...column, ...column].map((src, j) => (
                <Image
                  key={`${src}-${j}`}
                  src={src}
                  alt=""
                  width={520}
                  height={650}
                  /* The sources are already 520px, so this is not about
                     resizing — it is about serving AVIF instead of JPEG,
                     which is 20-30% of the bytes on crops like these.

                     The strip is `--mosaic-w` wide in a two-column grid, so
                     one slot is half of `max(clamp(300px, 38vw, 560px),
                     50vw - 252px)`. 25vw is that upper branch halved and is
                     right from about 1624px up; 19vw covers the clamp's
                     middle. Below 900px the strip becomes a full-width
                     shallow band, still two columns, hence 50vw. Erring
                     high by a few vw only picks a larger candidate width,
                     which is the safe direction. */
                  sizes="(max-width: 900px) 50vw, (min-width: 1624px) 25vw, 19vw"
                  quality={90}
                  /* The top of each column is above the fold; the rest of
                     it, and the whole duplicate half, is not.

                     `j < 2`, not `j === 0`: this element holds the LCP
                     candidate, and the first photograph of column 1 carries
                     `margin-top: -3 * gap`, so its *visible* rectangle is
                     smaller than the sibling below it. A lazy sibling that
                     is larger in view would be a later, larger candidate
                     and would push LCP out to whenever it loaded. Two eager
                     per column costs ~100KB and removes the race. */
                  loading={j < 2 ? "eager" : "lazy"}
                  /* Only the true candidate gets the high hint — the point
                     is to order it ahead of its own siblings, so marking
                     them all would restore the tie it exists to break.
                     `fetchPriority` rather than `preload`: the docs say to
                     prefer it, and it does not add a <link> to every route
                     that renders this section. */
                  fetchPriority={i === 0 && j === 0 ? "high" : undefined}
                  decoding="async"
                />
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Facts strip ──────────────────────────────────────── */}
      <section className="lp-facts">
        <div className="lp-wrap">
          <div className="lp-facts__grid">
            {FACTS.map((f) => (
              <div key={f.value} className="lp-facts__item">
                <p className="lp-facts__value">{f.value}</p>
                <p className="lp-facts__label">{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ─────────────────────────────────────────── */}
      <section className="lp-section" id="features">
        <div className="lp-wrap">
          <Reveal>
            <div className="lp-head lp-head--center">
              <p className="lp-eyebrow">Features</p>
              <h2 className="lp-display lp-h2">Everything the shop needs</h2>
              <p className="lp-lead">
                One dashboard for the storefront, the catalogue, the orders and
                the money.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.05}>
            <div className="lp-features">
              {FEATURES.map((f) => (
                <div key={f.title} className="lp-feature">
                  <f.icon size={24} className="lp-feature__icon" aria-hidden="true" />
                  <h3 className="lp-display lp-h3">{f.title}</h3>
                  <p className="lp-body">{f.body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── Showcase ─────────────────────────────────────────────
          This and the payments section below are now one pattern rather
          than two similar bands: an inset card on the page column, and
          the pair is mirrored — the copy sits left here and right there,
          so the figure changes sides between them. `LandingMotion` drifts
          the three `data-drift` elements against each other on scroll,
          which is why the copy and the figure each have a wrapper: the
          wrapper carries the scroll drift and the element inside it
          carries the `[data-rise]` entrance, so the two never write a
          transform to the same node.

          The `__grid` classes stay alongside the new panel ones because
          every sub-rule in this section hangs off them.

          `data-stack-item` enrols the card in the deck it forms with the
          payments card below — see the note in landing.css. The card
          drift is skipped for both of them: the deck owns this card's
          vertical position now.
          ───────────────────────────────────────────────────────────── */}
      <section
        className="lp-panelsec lp-panelsec--full lp-section"
        data-rise-card
        data-stack-item
      >
          {/* [data-rise] wraps the panel so the section-level rise tween
              and the card's [data-drift] never share the same node. */}
          <div data-rise>
          <div className="lp-panel lp-panel--brand" data-drift="panel">
            <div className="lp-showcase__grid lp-panel__grid" data-rise-group>
              <div className="lp-panel__copy" data-drift="copy">
                <p className="lp-eyebrow" data-rise>
                  The catalogue
                </p>
                <h2 className="lp-display lp-h2" data-rise>
                  Your products, in one place
                </h2>
                <p className="lp-lead" data-rise>
                  Prices, stock counts, photos and variants live together, and
                  the storefront reads from them directly. Change a price once
                  and the shop, the checkout and the invoice all agree.
                </p>
                <ul className="lp-pay__list lp-showcase__list" data-rise>
                  <li>
                    <LuCheck size={19} className="lp-pay__check" aria-hidden="true" />
                    <span>
                      <strong>Import what you already have</strong>
                      Upload a CSV of your products instead of typing them in
                      again.
                    </span>
                  </li>
                  <li>
                    <LuCheck size={19} className="lp-pay__check" aria-hidden="true" />
                    <span>
                      <strong>Stock that counts down</strong>
                      Sales reduce the stock figure, so the shop stops offering
                      what you have run out of.
                    </span>
                  </li>
                </ul>
              </div>
              {/* A photograph, so no browser chrome: the frame's fake address
                  bar would claim this is a screen capture of the catalogue,
                  which it isn't. Just the mount. */}
              <div className="lp-panel__fig" data-drift="fig">
                <figure className="lp-frame" data-rise>
                  <Image
                    src="/images/catalogue-wide.jpg"
                    alt="Bags and goods laid out on a table, ready to be listed for sale."
                    width={1100}
                    height={825}
                    /* Half the page in the two-column panel above 1080px,
                       full width below it where the panel stacks. The source
                       is 1100px and this renders at ~560px on a laptop, so
                       this is the one image on the page where resizing pays
                       as much as the format change. */
                    sizes="(max-width: 1080px) 100vw, 50vw"
                    /* Well below the fold — it is inside a `data-rise` group
                       that a ScrollTrigger reveals — so no eager hint. */
                    loading="lazy"
                  />
                </figure>
              </div>
            </div>
          </div>
          </div>{/* data-rise */}
      </section>

      {/* ─── Payments ─────────────────────────────────────────────
          The mirror of the catalogue above: `--swap` moves the figure to
          the left column and the copy to the right, and LandingMotion
          reads the same modifier to flip which way each column drifts.
          The copy stays first in the DOM either way — the swap is two
          `grid-column` declarations, so reading order never depends on
          which side of the card a thing is drawn on.

          The second and last card of the deck, so this is the one that
          ends up on top and stays at full size.
          ───────────────────────────────────────────────────────────── */}
      <section
        className="lp-panelsec lp-panelsec--full lp-section"
        id="payments"
        data-rise-card
        data-stack-item
      >
          <div data-rise>
          <div className="lp-panel lp-panel--swap" data-drift="panel">
            <div className="lp-pay__grid lp-panel__grid" data-rise-group>
              <div className="lp-panel__copy" data-drift="copy">
                <p className="lp-eyebrow" data-rise>
                  Payments
                </p>
                <h2 className="lp-display lp-h2" data-rise>
                  The way your customers already pay
                </h2>
                <p className="lp-pay__lead" data-rise>
                  Mobile money is how money moves in Cameroon, so it is the
                  checkout rather than an option bolted onto one.
                </p>
                <ul className="lp-pay__list" data-rise>
                  {PAYMENT_POINTS.map((p) => (
                    <li key={p.title}>
                      <LuCheck
                        size={19}
                        className="lp-pay__check"
                        aria-hidden="true"
                      />
                      <span>
                        <strong>{p.title}</strong>
                        {p.body}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="lp-pay__rails" data-rise>
                  <span className="lp-pay__rails-label">Rails</span>
                  {RAILS.map(({ label, Logo }) => (
                    <span key={label} className="lp-rail">
                      {/* The label names the rail in text, so the mark is
                          decoration rather than a second announcement of it. */}
                      <Logo className="lp-rail__logo" decorative />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* An illustration of the real checkout, not a live one — hidden
                  from assistive tech, since the list above says the same thing
                  in text. */}
              <div className="lp-panel__fig" data-drift="fig">
                <figure className="lp-pay__figure" aria-hidden="true" data-rise>
                  <div className="lp-co__head">
                    <div className="lp-co__store">Maison Ngo</div>
                    <div className="lp-co__url">maisonngo.koraa.cm/checkout</div>
                  </div>
                  <div className="lp-co__body">
                    <p className="lp-co__label">Pay with</p>
                    <div className="lp-co__methods">
                      {RAILS.map(({ label, Logo }, i) => (
                        <div
                          key={label}
                          className="lp-co__method"
                          /* The first rail is the one shown selected. */
                          data-on={i === 0 ? "" : undefined}
                        >
                          <span className="lp-co__radio">
                            {i === 0 ? <LuCheck size={10} /> : null}
                          </span>
                          <Logo className="lp-co__logo" decorative />
                          {label}
                        </div>
                      ))}
                    </div>
                    <div className="lp-co__total">
                      <span>Total</span>
                      <b>24,500 XAF</b>
                    </div>
                    <div className="lp-co__pay">Confirm payment</div>
                    <p className="lp-co__foot">
                      <LuLock size={11} />
                      Approved on the customer&rsquo;s phone
                    </p>
                  </div>
                </figure>
              </div>
            </div>
          </div>
          </div>{/* data-rise */}
      </section>

      {/* The deck's run-out: the scroll distance it needs to finish and
          let go before pricing arrives. Flat until `LandingMotion` deals a
          deck, so it costs nothing on the layouts that do not get one. */}
      <div className="lp-stack-end" aria-hidden="true" />

      {/* ─── Pricing ──────────────────────────────────────────── */}
      <section className="lp-section" id="pricing">
        <div className="lp-wrap">
          <Reveal>
            <div className="lp-head lp-head--center">
              <p className="lp-eyebrow">Pricing</p>
              <h2 className="lp-display lp-h2">Start free, pay once a year</h2>
              <p className="lp-lead">
                Billed annually in CFA francs, by MTN Mobile Money or Orange
                Money. Move up when the shop is busy enough to need it.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            {/* The table and its monthly/yearly toggle. Client-side for
                the toggle's state only — Next still renders it into the
                initial HTML, so the prices are in the markup exactly as
                they were when this was inlined here. */}
            <PricingPlans plans={plans} universal={universal} />
          </Reveal>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────── */}
      <section className="lp-section lp-section--tight" id="faq">
        <div className="lp-wrap">
          <Reveal>
            <div className="lp-head lp-head--center">
              <p className="lp-eyebrow">Questions</p>
              <h2 className="lp-display lp-h2">Before you start</h2>
            </div>
          </Reveal>
          <div className="lp-faq">
            {FAQS.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── Closing CTA ──────────────────────────────────────── */}
      <section className="lp-cta lp-section">
        <div className="lp-wrap lp-cta__inner">
          <h2 className="lp-display lp-h2">Your shop could be open today</h2>
          <p>
            Sign up, add a product, and share the link. The free plan does not
            expire, so there is nothing to cancel if you change your mind.
          </p>
          <div className="lp-cta__actions">
            <Link
              href="/auth/register"
              className="lp-btn lp-btn--on-ink lp-btn--lg"
            >
              Open a shop
              <LuArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link href="/domains" className="lp-btn lp-btn--ghost-ink lp-btn--lg">
              Find a domain
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
