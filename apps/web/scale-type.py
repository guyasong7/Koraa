#!/usr/bin/env python3
"""
One-off: raise the type scale.

Every font size in this app was set 2–3 steps too small — 11px uppercase
labels, 13px body copy, 14px controls. Below ~15px, body text stops being
comfortable to read, and the micro-labels were effectively decorative.

The fix is not a blanket multiplier. A uniform +12% keeps 11px labels
under-sized (11 -> 12.3) while pushing an already-large 72px hero
heading to 80px. So the ladder below lifts the small end hardest and
tapers to almost nothing at the top:

    11px -> 13px   (+18%)
    14px -> 16px   (+14%)
    24px -> 26px   (+8%)
    72px -> 76px   (+6%)

Only `font-size:` (CSS) and `fontSize:` (inline JSX styles) are rewritten.
`rem` appears nowhere else in either stylesheet — spacing, radii and
dimensions are all px — so this changes type without moving any box.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent / "src"

#: Old px -> new px. Covers every value that actually appears; anything
#: unlisted falls through to the formula below so a future size added by
#: hand is still scaled sensibly rather than silently skipped.
LADDER = {
    9: 11, 10: 12, 11: 13, 12: 14, 13: 15, 14: 16, 15: 17, 16: 18,
    17: 19, 18: 20, 19: 21, 20: 22, 22: 24, 24: 26, 26: 28, 28: 30,
    30: 32, 32: 34, 36: 39, 40: 43, 44: 47, 48: 51, 72: 76,
}


def scale_px(px: float) -> float:
    if px in LADDER:
        return LADDER[px]
    if px <= 20:
        return px + 2
    if px <= 32:
        return round(px * 1.08)
    return round(px * 1.06)


def fmt(value: float) -> str:
    """Trim trailing zeros so 16.0 prints as 16, 0.8125 stays exact."""
    text = f"{value:.4f}".rstrip("0").rstrip(".")
    return text or "0"


def rewrite_lengths(declaration: str) -> str:
    """Scale every rem/px length inside one font-size value.

    Handles clamp() for free: the `vw` term has no rem/px suffix so it is
    left alone, which is what keeps the fluid heading fluid.
    """

    def one(match: re.Match) -> str:
        number, unit = float(match.group(1)), match.group(2)
        px = number * 16 if unit == "rem" else number
        new_px = scale_px(px)
        return f"{fmt(new_px / 16)}rem" if unit == "rem" else f"{fmt(new_px)}px"

    return re.sub(r"(\d*\.?\d+)(rem|px)\b", one, declaration)


def do_css(path: Path) -> int:
    source = path.read_text()
    hits = 0

    def repl(match: re.Match) -> str:
        nonlocal hits
        hits += 1
        return f"font-size:{rewrite_lengths(match.group(1))};"

    out = re.sub(r"font-size:([^;{}]+);", repl, source)

    # A few declarations annotate themselves — `1.75rem;  /* 28px */`.
    # Recompute those comments from the new value so they don't turn into
    # confident lies the moment this runs.
    def annotation(match: re.Match) -> str:
        return f"{match.group(1)}/* {fmt(float(match.group(2)) * 16)}px */"

    out = re.sub(
        r"(font-size:\s*(\d*\.?\d+)rem;\s*)/\*\s*\d+px\s*\*/", annotation, out
    )

    path.write_text(out)
    return hits


def do_tsx(path: Path) -> int:
    source = path.read_text()
    hits = 0

    def bare(match: re.Match) -> str:
        nonlocal hits
        hits += 1
        return f"{match.group(1)}{fmt(scale_px(float(match.group(2))))}"

    out = re.sub(r"(fontSize:\s*)(\d*\.?\d+)\b", bare, source)

    def quoted(match: re.Match) -> str:
        nonlocal hits
        hits += 1
        return f'{match.group(1)}"{rewrite_lengths(match.group(2))}"'

    out = re.sub(r'(fontSize:\s*)"([^"]+)"', quoted, out)

    if out != source:
        path.write_text(out)
    return hits


def main() -> int:
    total = 0
    for path in sorted(ROOT.rglob("*.css")):
        n = do_css(path)
        total += n
        print(f"{n:5}  {path.relative_to(ROOT)}")
    for path in sorted(ROOT.rglob("*.tsx")):
        n = do_tsx(path)
        if n:
            total += n
            print(f"{n:5}  {path.relative_to(ROOT)}")
    print(f"\n{total} font sizes scaled")
    return 0


if __name__ == "__main__":
    sys.exit(main())
