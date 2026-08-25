import {
  LOGO_VIEWBOX,
  MARK_PATHS,
  MARK_STROKES,
  MARK_VIEWBOX,
  WORD_PATHS,
} from "./logoPaths";

/**
 * The Koraa logo, as vectors.
 *
 * It shipped as a 250x100 black PNG, and dark mode recoloured it with
 * `filter: brightness(0) invert(1)` — a filter that can only produce black or
 * white. That is why the logo was the one element on the site that could not
 * be brand-coloured, and why it went soft anywhere it was shown large.
 *
 * Colour comes from `currentColor`, so a single `color` declaration in CSS
 * puts it in --brand-solid on the nav, in bright ochre on the footer's ink
 * panel, or anywhere else. Size comes from CSS `height` — the viewBox carries
 * the aspect ratio, so width follows on its own.
 *
 * Every glyph is a separate path tagged with `data-logo`, which is what
 * LandingMotion targets to draw the wave and stagger the letters.
 */
export default function KoraaLogo({
  className,
  variant = "full",
  label = "Koraa",
  decorative = false,
  strokeWidth = 1.1,
  ...rest
}: {
  className?: string;
  /** `mark` is the filled wave; `outline` strokes its rings for DrawSVG. */
  variant?: "full" | "mark" | "outline";
  label?: string;
  /** Hide from assistive tech — for the decorative copy behind the hero. */
  decorative?: boolean;
  /** `outline` only. In viewBox units: the wave is ~48 units across. */
  strokeWidth?: number;
} & React.SVGProps<SVGSVGElement>) {
  const stroked = variant === "outline";
  const paths = stroked
    ? MARK_STROKES
    : variant === "mark"
      ? MARK_PATHS
      : [...MARK_PATHS, ...WORD_PATHS];

  return (
    <svg
      className={className}
      viewBox={variant === "full" ? LOGO_VIEWBOX : MARK_VIEWBOX}
      role={decorative ? "presentation" : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      focusable="false"
      fill={stroked ? "none" : "currentColor"}
      stroke={stroked ? "currentColor" : undefined}
      strokeWidth={stroked ? strokeWidth : undefined}
      strokeLinecap={stroked ? "round" : undefined}
      strokeLinejoin={stroked ? "round" : undefined}
      /* A hairline that stays a hairline: the flourish is scaled to several
         hundred px wide, and a stroke that scaled with it would read as a
         thick outline rather than as atmosphere. Path length, which DrawSVG
         measures in user units, is unaffected. */
      vectorEffect={stroked ? "non-scaling-stroke" : undefined}
      {...rest}
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fillRule={stroked ? undefined : "evenodd"}
          clipRule={stroked ? undefined : "evenodd"}
          data-logo={variant === "full" && i >= MARK_PATHS.length ? "glyph" : "mark"}
        />
      ))}
    </svg>
  );
}
