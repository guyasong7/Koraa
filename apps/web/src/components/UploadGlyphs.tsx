/**
 * Line-art glyphs for the identity verification steps.
 *
 * These replace the numbered circles the steps used to carry. A "1" tells
 * a merchant which step they are on, which the step list already tells them;
 * a drawing of a card with a portrait on it tells them *what to photograph*,
 * which is the part people get wrong. The back-of-card and selfie glyphs
 * exist for the same reason — the two ID sides are otherwise easy to mix up.
 *
 * Every stroke is `currentColor`, with no fill but the low-opacity plate on
 * the card stripe. That is the whole colour contract: whatever sets `color`
 * on an ancestor decides what these are, so the call site paints them the
 * brand once and both themes follow. Hard-coding the ochre here would pin
 * them to one theme and put a raw ramp value in a component, which the token
 * layering in `globals.css` exists to prevent.
 *
 * Server-safe — no "use client", no state, no handlers.
 *
 * Drawn on a 48x48 grid at 1.6 stroke, which holds together down to about
 * 24px. Below that the portrait circle and the card's text lines start to
 * merge and a simpler mark would be better.
 */

type GlyphProps = {
  className?: string;
  size?: number;
  /**
   * Left unset, a glyph is decorative — every call site already names the
   * step in a heading beside it, so announcing "front of ID card" again
   * would just be the same sentence twice.
   */
  title?: string;
};

/** Shared geometry, so the three cards line up with each other. */
const CARD = { x: 6, y: 13, w: 36, h: 24, r: 3 } as const;

function Svg({
  className,
  size = 32,
  title,
  children,
}: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** A card seen face-on: portrait at the left, three lines of detail. */
export function IdFrontGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx={CARD.r} />
      <circle cx={17} cy={23} r={4} />
      {/* Shoulders, cropped by the card's lower half rather than drawn as a
          full body — a portrait on an ID is a head-and-shoulders crop. */}
      <path d="M11.5 32c1.2-2.6 3.2-3.9 5.5-3.9s4.3 1.3 5.5 3.9" />
      <path d="M29 20.5h8" />
      <path d="M29 25h8" />
      <path d="M29 29.5h5.5" />
    </Svg>
  );
}

/** The reverse: the dark band across the top, a signature rule below it. */
export function IdBackGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx={CARD.r} />
      {/* The one filled shape in the set. A magnetic stripe is a solid band
          and outlining it would read as a second, empty card inside the
          first. 0.18 keeps it a tint of whatever colour is inherited. */}
      <rect
        x={CARD.x}
        y={17}
        width={CARD.w}
        height={5.5}
        fill="currentColor"
        fillOpacity={0.18}
        stroke="none"
      />
      <path d="M11.5 28.5h15" />
      <path d="M11.5 32.5h9" />
    </Svg>
  );
}

/** A face beside a held card — the pose the step is asking for. */
export function SelfieIdGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <circle cx={18} cy={17.5} r={6} />
      <path d="M7.5 37c1.6-5.6 5.5-8.4 10.5-8.4 2 0 3.8.45 5.4 1.3" />
      {/* Held to one side and overlapping the shoulder line, because a card
          floating clear of the body reads as two unrelated objects. */}
      <rect x={27} y={25} width={15} height={11} rx={2} />
      <path d="M30.5 29.5h8" />
      <path d="M30.5 32.5h5" />
    </Svg>
  );
}

/**
 * Tray with a rising arrow, for the drop zone itself.
 *
 * An arrow that starts inside the tray and breaks its top edge, rather than
 * a cloud: nothing here goes to a third party, it goes to the merchant's own
 * verification record, and a cloud says the opposite.
 */
export function UploadGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M10 29v6a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3v-6" />
      <path d="M24 32V12" />
      <path d="M16.5 19.5 24 12l7.5 7.5" />
    </Svg>
  );
}

/** A tick for a step already satisfied, drawn to match the set's weight. */
export function UploadedGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <circle cx={24} cy={24} r={14} />
      <path d="M17.5 24.5l4.5 4.5 9-9.5" />
    </Svg>
  );
}
