/**
 * The two mobile money networks the checkout integrates, as their own marks
 * rather than as coloured dots.
 *
 * MTN is the official `MTN Mobile Money` lockup from `public/`. Orange is
 * still a recreation in the network's published brand colour (#FF7900),
 * because the file supplied alongside MTN's — `public/orange_money.png` —
 * is a 50x50 fragment: 755 opaque pixels, only 186 of them orange and the
 * rest white, with no wordmark. At the 22px these marks render at it comes
 * out a smudge, and its white bulk reads as a mistake on the footer's ink
 * ground. Drop a real Orange Money lockup at that path and swap the body of
 * `OrangeLogo` for an `<img>` the way `MtnLogo` now is; every place a rail
 * is shown imports from here, so that is one file to edit and not five call
 * sites to find.
 *
 * Orange's wordmark is `<text>` in a Helvetica-first stack, which is the
 * face the brand sets its own in. Drawing it as outlines would be more
 * faithful, but a badge this size resolves to roughly 18px of cap height and
 * the difference does not survive that.
 *
 * Server-safe — no "use client". Both render identically on either theme
 * because a payment network's colour is not ours to theme: MTN yellow that
 * shifted in dark mode would stop being MTN yellow. The MTN lockup is
 * transparent outside its yellow field, so it sits on paper and on ink
 * without a plate behind it.
 *
 * White on Orange's #FF7900 measures 2.6:1, under the 4.5:1 normal text
 * needs. That is Orange's own logotype, and WCAG exempts text that is part
 * of a logo from contrast requirements — but only because the meaning is
 * carried elsewhere, so each mark is a labelled graphic and every call site
 * also names the rail in real text beside it.
 */


type RailLogoProps = {
  className?: string;
  /** Set when the rail is already named in text beside the mark. */
  decorative?: boolean;
};

/**
 * The official lockup, intrinsic 395x264.
 *
 * A plain `<img>` rather than `next/image`: every call site sizes the mark
 * by height and lets the width follow, and `next/image` warns when only one
 * of its two dimensions is overridden in CSS. The file is 13KB of flat
 * colour, so there is no optimisation being given up — the same trade the
 * hero mosaic makes.
 */
export function MtnLogo({ className, decorative = false }: RailLogoProps) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      className={className}
      src="/mtn_mobile_money.png"
      alt={decorative ? "" : "MTN Mobile Money"}
      aria-hidden={decorative || undefined}
      width={395}
      height={264}
      decoding="async"
    />
  );
}

/** Orange Money lockup from public/orange_money.png.
 *  The PNG has a transparent background — on light surfaces it vanishes.
 *  A small orange pill restores the brand colour as a backing plate. */
export function OrangeLogo({ className, decorative = false }: RailLogoProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#FF7900",
        borderRadius: "8px",
        padding: "4px 8px",
        lineHeight: 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={className}
        src="/orange_money.png"
        alt={decorative ? "" : "Orange Money"}
        aria-hidden={decorative || undefined}
        width={50}
        height={50}
        decoding="async"
        style={{ display: "block" }}
      />
    </span>
  );
}

/** The rails, in the order the checkout offers them. */
export const RAILS = [
  { label: "MTN Mobile Money", short: "MTN", Logo: MtnLogo },
  { label: "Orange Money", short: "Orange", Logo: OrangeLogo },
] as const;
