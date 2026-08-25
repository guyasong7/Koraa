"use client";

import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(useGSAP, DrawSVGPlugin, ScrollTrigger, SplitText);

/**
 * Motion for the landing page — one orchestrated page load, then interactions.
 *
 * Renders nothing, and attaches to the server-rendered DOM by selector. That
 * keeps `page.tsx` a server component (the pricing table has to be *in* the
 * HTML rather than appear after hydration) while still letting the hero move.
 *
 * The opening states are declared in landing.css under `[data-hero]`, not set
 * from here: this runs after the server HTML has already painted, so hiding
 * things in JS would show the finished hero and then rewind it. CSS hides
 * them, GSAP reveals them, `<noscript>` in layout.tsx un-hides them where
 * GSAP will never run, and the reduced-motion branch below reveals them
 * without moving anything.
 *
 * `_ui.tsx`'s framer-motion `Reveal` still owns the scroll reveals in the
 * features, pricing and FAQ sections. The two payments and catalogue sections
 * are GSAP's — their `Reveal` wrappers were removed when `[data-rise]` went
 * in, because two libraries writing transforms to one element fight, and the
 * line between them is which library hides the element in the first place.
 *
 * Deliberately unscoped: `useGSAP`'s `scope` option rewrites every selector
 * string to look inside one element, and everything animated here lives
 * elsewhere in the tree.
 */
export default function LandingMotion() {
  useGSAP(() => {
    const mm = gsap.matchMedia();

    /* ── Scroll drift helpers ───────────────────────────────────────
       Shared by the two matchMedia branches that move the catalogue and
       payments cards, so they are declared out here rather than in either
       of them.

       Triggered off the `<section>`, never off the card. The card is what
       these tweens translate, and a ScrollTrigger that measures an element
       it is also moving re-resolves its own start and end on every refresh
       — the section around it is the fixed frame of reference the offsets
       are measured against.

       `y`, not `yPercent`: a 380px checkout card sits beside four
       paragraphs, so one percentage would hand the two columns quite
       different travel. Different elements, same pixels. */
    const drift = (el: Element | null, section: HTMLElement, px: number) => {
      if (!el) return;
      gsap.fromTo(
        el,
        { y: px },
        {
          y: -px,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            /* The full crossing — the card entering the bottom of the
               window through to it leaving the top — so the midpoint of
               the travel is the moment the card is centred in view. */
            start: "top bottom",
            end: "bottom top",
            scrub: true,
            invalidateOnRefresh: true,
          },
        },
      );
    };

    const driftPanels = (fn: (panel: HTMLElement, section: HTMLElement) => void) =>
      gsap.utils.toArray<HTMLElement>('[data-drift="panel"]').forEach((panel) => {
        const section = panel.closest<HTMLElement>(".lp-panelsec");
        if (section) fn(panel, section);
      });

    /* Reduced motion: everything arrives, nothing travels. Not the same
       timeline at zero duration — that would still install transforms and
       hand every element to the compositor for nothing. */
    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set("[data-hero]", { opacity: 1, y: 0, scale: 1 });
      gsap.set("[data-draw]", { opacity: 1 });
      gsap.set("[data-rise]", { opacity: 1, y: 0 });
      gsap.set("[data-rise-card] > [data-rise]", { opacity: 1, y: 0 });
      gsap.set(".lnav__logo path", { opacity: 1, rotate: 0, scale: 1, y: 0 });
      gsap.set(".lp-mark", { "--frame-o": 1 });
      /* Nothing to reveal for the cards — their drift is additive, so not
         installing it is already the correct resting state. */
    });

    /* The counter-drift inside each card needs a width as well as a motion
       preference, so it gets its own branch rather than a guard inside the
       one below.

       This is the half that reads as a swap: the copy climbs while the
       figure sinks, so over the length of a card the two columns trade
       vertical positions — and on the mirrored card the directions flip
       along with the layout, so the pair moves as one gesture instead of
       as the same section twice.

       Below 1081px there is only one column to drift. Both grids have
       collapsed by then — payments at 980, the catalogue at 1080 — and a
       copy block sliding against the figure stacked beneath it is not a
       swap, just two things sliding; 30px of it would also push a column
       past the card's own padding, which narrows to 28px at that end.
       Expressed as a query rather than an `if` so GSAP reverts these
       tweens when the window crosses the breakpoint, instead of leaving a
       stale transform on a layout it was never measured for. */
    mm.add(
      "(prefers-reduced-motion: no-preference) and (min-width: 1081px)",
      () => {
        driftPanels((panel, section) => {
          const dir = panel.classList.contains("lp-panel--swap") ? -1 : 1;
          drift(panel.querySelector('[data-drift="copy"]'), section, 30 * dir);
          drift(panel.querySelector('[data-drift="fig"]'), section, -34 * dir);
        });
      },
    );

    /* ── The card deck ──────────────────────────────────────────────
       The catalogue and payments cards are dealt onto each other: the
       catalogue is held under the nav while the payments card climbs up
       and covers it, leaving a step of the card beneath showing, and the
       pair then scrolls away as one deck.

       Pinned by transform, not by `position: fixed` or ScrollTrigger's
       own `pin` — both of those take the card out of flow and insert a
       spacer where it was, which would move every measurement the drift
       tweens above are built on. Here a card's layout box never moves and
       only its transform does, so the sections stay exactly where the
       rest of this file measured them.

       Gated at 1081px for the same reason the counter-drift is: below it
       both grids have collapsed to one column, and a card taller than the
       window cannot be held at the top of it without its own bottom half
       being cut off. `fits` is that rule again, against real heights
       rather than a guess about which widths produce them.
       ─────────────────────────────────────────────────────────────── */
    mm.add(
      "(prefers-reduced-motion: no-preference) and (min-width: 1081px)",
      () => {
        const cards = gsap.utils
          .toArray<HTMLElement>("[data-stack-item]")
          .map((section) => ({
            section,
            el: section.querySelector<HTMLElement>(".lp-panel"),
          }))
          .filter(
            (card): card is { section: HTMLElement; el: HTMLElement } =>
              card.el !== null,
          );
        const runOut = document.querySelector<HTMLElement>(".lp-stack-end");
        if (cards.length < 2 || !runOut) return;

        /* How far each card lands below the one before it. Small on
           purpose: with two cards the deck is a step and a shadow, not a
           fan.

           There is no companion scale. A covered card used to give up a
           few per cent per level of depth, which is the usual way a deck
           reads as a deck — but it also made the card underneath visibly
           narrower than the one on top, and these two are meant to be the
           same card twice. The step and the shadow carry the depth on
           their own; every card in the deck keeps its full width. */
        const STEP = 22;

        /* Written by `measure`, read by `render`. Out here so the scroll
           path allocates nothing and holds no closure of its own. */
        let pinStart: number[] = [];
        let pinEnd = 0;
        let vh = 0;
        let roomy = false;
        let fits = false;

        /* Last string written per card, so a scroll that does not move one
           past a rounding step writes nothing at all. */
        const painted = cards.map(() => "");

        const docTop = (el: HTMLElement) =>
          el.getBoundingClientRect().top + window.scrollY;

        /* Under the bar, plus a gap. Measured off it rather than stated,
           because its height is a clamp on the viewport width. */
        const stackTop = () =>
          (document.querySelector<HTMLElement>(".lnav")?.offsetHeight ?? 72) +
          20;

        /* Whether there is room to hold the deck at all, and the run-out
           that follows from the answer.

           Only the last card has to fit. It is the one on top, and the one
           being read while the deck is held; the cards under it are covered
           to within a 22px step of their own top edge, so how far their
           bottoms fall past the fold is not something anyone can see.

           The tolerance is the card's own bottom padding — losing the last
           few pixels of that costs nothing, and these panels are tall enough
           that insisting on every one of them would turn the deck off on a
           1080p window by about nine pixels. Below roughly 900px of viewport
           it does switch off: a card that cannot be held without cutting
           into its copy should not be held.

           The run-out is sized here, from JS, rather than left to the media
           query that gates this branch: the query cannot know this test's
           answer, and a spacer standing at 60vh with no deck to run out is
           just a hole in the page above pricing. It is written before
           ScrollTrigger measures, which is what `refreshInit` is for —
           changing the height of anything during `onRefresh` would leave the
           trigger's own end position a screen out of date. */
        const size = () => {
          vh = window.innerHeight;
          const last = cards[cards.length - 1].el;
          const slack = parseFloat(getComputedStyle(last).paddingBottom) || 0;
          roomy =
            last.offsetHeight + stackTop() + STEP * (cards.length - 1) <=
            vh + slack;
          runOut.style.height = roomy ? `${Math.round(vh * 0.6)}px` : "0px";
        };

        const measure = () => {
          const top = stackTop();

          /* Measured with the transforms taken off, which is the only way
             to read a position from an element this also moves. `offsetTop`
             would be transform-proof but is measured from the section's
             padding edge, and the section carries 96px of it — so it
             reports the card 96px higher than it sits. One forced reflow,
             on refresh only, in exchange for the true number. */
          cards.forEach(({ el }, i) => {
            el.style.transform = "";
            painted[i] = "";
          });
          pinStart = cards.map(
            ({ el }, i) => docTop(el) - top - STEP * i,
          );

          const landed = pinStart[pinStart.length - 1];

          /* Two ceilings on the release, and the lower one wins. The dwell
             is how long the finished deck is held once the last card has
             landed — without it a tall pair would sit there for most of a
             screen with nothing left to happen. The run-out is the hard
             limit: the section after the deck paints over it by document
             order, so the deck has to be moving again before that
             section's first line can reach a card. */
          pinEnd = Math.min(
            landed + vh * 0.55,
            docTop(runOut) + runOut.offsetHeight - vh,
          );

          /* Room to hold the deck, and room to let go of it again. */
          fits = roomy && pinEnd > landed + 40;
        };

        const render = () => {
          const scrollTop = window.scrollY;

          cards.forEach(({ el }, i) => {
            let transform = "";

            if (fits) {
              /* The pin, in one line. `pinStart[i]` is the scroll position
                 at which the card reaches its place in the deck, so the
                 offset it needs from then on is just how far past that the
                 page has come — and clamping the scroll to `pinEnd` is
                 what makes the whole deck let go together and travel on as
                 one object. */
              const y = Math.max(0, Math.min(scrollTop, pinEnd) - pinStart[i]);
              transform = `translate3d(0, ${Math.round(y * 100) / 100}px, 0)`;
            }

            if (transform !== painted[i]) {
              el.style.transform = transform;
              painted[i] = transform;
            }
          });
        };

        /* One trigger over the whole run, from the first card entering the
           window to the run-out leaving it. Outside that span there is
           nothing to recompute: above it every card is at rest, and below
           it the deck is already frozen at the values `pinEnd` gave it.

           `size` runs on `refreshInit`, before ScrollTrigger has measured
           anything, because it changes the height of the page. `measure`
           runs on `onRefresh`, after — it only reads. Between them every
           resize and refresh leaves the numbers and the layout agreeing. */
        ScrollTrigger.addEventListener("refreshInit", size);
        size();

        ScrollTrigger.create({
          trigger: cards[0].section,
          start: "top bottom",
          endTrigger: runOut,
          end: "bottom top",
          onUpdate: render,
          onRefresh: () => {
            measure();
            render();
          },
        });

        /* The transforms are written to `style` directly rather than
           through a tween, so GSAP has no record of them to revert when
           this context is torn down at the breakpoint. Same for the run-out:
           this branch put a height on it, so this branch takes it off. */
        return () => {
          ScrollTrigger.removeEventListener("refreshInit", size);
          runOut.style.height = "";
          cards.forEach(({ el }) => {
            el.style.transform = "";
          });
        };
      },
    );

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      /* ── Page load ────────────────────────────────────────────────
         One timeline. Each piece is positioned against the one before it,
         so the sequence is authored in a single place instead of as a
         scatter of matching delays.

         `fromTo` rather than `from` throughout: the opening states are in
         CSS, so a bare `from` would read the already-closed value as its
         start *and* its end and animate nothing. Both ends stated. */
      const tl = gsap.timeline({ defaults: { ease: "power3.out", duration: 0.8 } });

      /* The wave unrolls, then the letters land — the mark reads as being
         drawn rather than as six shapes fading up together. Rotation suits
         it because the mark *is* a circular wave.

         Plain `y`, not `yPercent`: inside an SVG this is user-space, and
         9 of the viewBox's 47 units is a predictable fifth of its height
         without depending on how each glyph's bbox measures. */
      tl.fromTo(
        '.lnav__logo path[data-logo="mark"]',
        { opacity: 0, rotate: -110, scale: 0.55, transformOrigin: "50% 50%" },
        { opacity: 1, rotate: 0, scale: 1, duration: 0.95, ease: "power4.out" },
      ).fromTo(
        '.lnav__logo path[data-logo="glyph"]',
        { opacity: 0, y: 9 },
        { opacity: 1, y: 0, duration: 0.55, stagger: 0.06 },
        "-=0.62",
      );

      /* The headline is split into lines and each line rises out from behind
         its own mask, which is what makes it read as typeset rather than as a
         block that faded up. `autoSplit` re-splits when the webfont swaps in
         or the line count changes; returning the tween from `onSplit` lets
         GSAP swap it out cleanly instead of stacking a second one on top. */
      const h1 = document.querySelector<HTMLElement>(".lp-hero .lp-h1");
      if (h1) {
        // Once the first reveal has finished, a re-split is a resize rather
        // than a font swap — restage the lines, but don't replay the entrance.
        let played = false;
        // The masks do the hiding from here on; the element itself has to
        // stop being transparent or there is nothing to reveal.
        gsap.set(h1, { opacity: 1 });
        SplitText.create(h1, {
          type: "lines",
          mask: "lines",
          linesClass: "lp-line",
          autoSplit: true,
          aria: "auto",
          onSplit: (self) => {
            /* The mask wrappers clip at the line box, and they stay in the
               DOM after the reveal. That is a problem for the headline's
               selection box, which outsets past the line box on every side
               and would be permanently sheared. Once a line has arrived the
               mask has no job left, so it is released — and released
               immediately on a re-split, where there is no entrance to
               hide. */
            const release = () =>
              self.lines.forEach((line) => {
                const wrapper = (line as HTMLElement).parentElement;
                if (wrapper) wrapper.style.overflow = "visible";
              });

            if (played) {
              release();
              return;
            }
            /* The delay is what gives this its place in the sequence:
               `SplitText.create` fires `onSplit` immediately, so the tween
               is built outside the timeline and cannot be positioned on
               it. 0.4s puts it just behind the logo. */
            return gsap.from(self.lines, {
              yPercent: 110,
              duration: 1,
              ease: "power4.out",
              stagger: 0.085,
              delay: 0.4,
              onComplete: () => {
                played = true;
                release();
              },
            });
          },
        });
      }

      tl.to(
        '[data-hero="sub"], [data-hero="actions"], [data-hero="note"], [data-hero="rails"]',
        { opacity: 1, y: 0, duration: 0.7, stagger: 0.1 },
        0.82,
      ).to(
        /* Scale only — no opacity. The strip is visible in the server HTML
           because it holds the LCP image; see the `[data-hero="mosaic"]`
           note in landing.css for why fading it in cost 4.2s of LCP.
           `to` reads the computed `scale(1.04)` as its start, so the
           settle is unchanged. Still at 0.25 so it overlaps the headline
           and the hero reads as one composition however late this runs. */
        '[data-hero="mosaic"]',
        { scale: 1, duration: 1.4 },
        0.25,
      );

      /* The selection box snaps on around the phrase after the headline
         has landed — two lines at 0.4 + 0.085 stagger + 1s is done by
         1.5. It reads as a design tool selecting the words, which only
         works if the words are there first.

         A custom property rather than the pseudo-elements' opacity,
         because GSAP cannot address a pseudo-element: landing.css has
         both ::before and ::after reading `var(--frame-o)`. */
      tl.to(
        ".lp-mark",
        { "--frame-o": 1, duration: 0.34, ease: "power2.out" },
        1.5,
      );

      /* The oversized wave behind the hero draws itself in last and slowest.
         It is atmosphere, so it should still be resolving after the copy has
         settled rather than competing with it for attention. */
      tl.to('[data-draw="flourish"]', { opacity: 1, duration: 1.4 }, 0.4).from(
        '[data-draw="flourish"] path',
        { drawSVG: "0%", duration: 2.6, ease: "power1.inOut", stagger: 0.14 },
        0.4,
      );

      /* ── The photo marquee ────────────────────────────────────────
         Each column is rendered twice, so translating it up by exactly
         half its height puts the second copy where the first one was —
         the same frame, which is why `repeat: -1` can snap back to the
         start without a visible jump. `ease: "none"` for the same
         reason: any easing would make the loop point a change of speed.

         One column up, one down, at different durations. Two columns
         drifting the same way at the same rate reads as one sheet
         sliding, which is what the offsets and the opposing directions
         are for. Slow — a minute of travel is atmosphere; anything
         faster competes with the headline it sits beside.

         The duration comes from the distance rather than being a
         constant, because the strip is now sized off the viewport
         (`--mosaic-w` runs to within 252px of the middle of the screen)
         and the images keep their aspect ratio, so a column on a wide
         monitor is close to twice as tall as one on a laptop. A fixed
         58s would have meant close to twice the speed there. 24 and
         20.5 px/s are what the old constants worked out to at the width
         the strip used to cap at. Measured once: a reader who resizes
         the window shifts the rate by a few px/s, which is nothing on
         something this slow.

         Not part of the load timeline: it is ambient, and it should be
         running by the time the strip fades in rather than starting
         from a standstill afterwards. */
      gsap.utils.toArray<HTMLElement>(".lp-hero__col").forEach((col, i) => {
        const up = i % 2 === 0;
        gsap.fromTo(
          col,
          /* `y: 0` is not redundant. The down-moving column's frame zero is
             `translateY(-50%)` in landing.css, and getComputedStyle resolves
             a percentage transform to a pixel matrix — so GSAP reads it back
             as `y: -1344px, yPercent: 0`. It writes
             `translate(x, y) translate(xPercent%, yPercent%)`, so setting
             yPercent alone would stack the two and double the offset.
             Stating y zeroes the pixel half so only the percentage governs. */
          { yPercent: up ? 0 : -50, y: 0 },
          {
            yPercent: up ? -50 : 0,
            duration: col.offsetHeight / 2 / (24 - i * 3.5),
            ease: "none",
            repeat: -1,
          },
        );
      });

      /* ── Section rise ─────────────────────────────────────────────
         The payments and catalogue sections come up from below as they
         arrive, once each. Grouped rather than per-element: the trigger
         is the grid, so a section's copy staggers as one chain against
         one scroll position instead of every line waiting for its own
         and arriving in a ragged sequence on a fast scroll.

         `once` and no `scrub` — a rise that plays and then leaves the
         section alone, with nothing still attached to the scroll
         position afterwards.

         `start: "top 78%"` fires while the group's own copy is still
         below the fold, which matters because the closed state is in
         CSS: an element whose trigger never fires stays hidden for
         good, so the trigger has to be generous rather than exact.

         Built inside the matchMedia context, which reverts the
         ScrollTriggers it creates along with the tweens — so the
         cleanup below has nothing to add. */
      const riseTrigger = (trigger: HTMLElement) => ({
        trigger,
        start: "top 78%",
        once: true,
      });

      gsap.utils.toArray<HTMLElement>("[data-rise-group]").forEach((group) => {
        const items = gsap.utils.toArray<HTMLElement>(
          group.querySelectorAll("[data-rise]"),
        );
        /* The figure is lifted out of the chain. It is the largest thing
           in the group and last in document order, so on the chain it
           would arrive half a second behind the copy it sits beside;
           on its own tween it rises with the second line. */
        const figures = items.filter((el) => el.tagName === "FIGURE");
        const copy = items.filter((el) => el.tagName !== "FIGURE");

        if (copy.length) {
          gsap.to(copy, {
            opacity: 1,
            y: 0,
            duration: 0.9,
            ease: "power3.out",
            stagger: 0.1,
            scrollTrigger: riseTrigger(group),
          });
        }

        if (figures.length) {
          gsap.to(figures, {
            opacity: 1,
            y: 0,
            duration: 1.1,
            ease: "power3.out",
            delay: 0.15,
            scrollTrigger: riseTrigger(group),
          });
        }
      });

      /* ── Full-width catalogue card rise ──────────────────────────
         The catalogue panel uses `data-rise-card` (not `data-rise-group`)
         so it does not interfere with the inner group that staggers the
         copy. One tween, fired once, targeting the direct [data-rise]
         child — which is a wrapper div around the drifting `.lp-panel`,
         keeping the two y-transform writers on separate nodes. */
      gsap.utils
        .toArray<HTMLElement>("[data-rise-card]")
        .forEach((card) => {
          const riseEl = card.querySelector<HTMLElement>(":scope > [data-rise]");
          if (!riseEl) return;
          gsap.to(riseEl, {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: card,
              start: "top 80%",
              once: true,
            },
          });
        });

      /* ── Card drift ───────────────────────────────────────────────
         The catalogue and payments cards move while they cross the
         viewport. The counter-drift between each card's two columns is a
         separate matchMedia below, because it needs a width as well.

         `scrub: true` is the whole point — the offset is tied to the
         scroll position rather than played once, so the reader is the one
         moving it and it runs backwards on the way up.

         Additive, which is the opposite contract from `[data-rise]`
         above. Nothing here is hidden in CSS waiting on a trigger: the
         resting layout in landing.css is the finished layout and this only
         offsets it. A parallax the section also depends on to be readable
         takes the section down with it the first time it doesn't run. */
      driftPanels((panel, section) => {
        /* The deck below already owns this card's vertical position, and
           34px of parallax on a card being held under the nav is two
           writers fighting over one transform. The counter-drift above is
           untouched: that runs on the card's two columns, which are nodes
           the deck never writes to, so the copy and the figure keep
           trading places inside a card that is being held. */
        if (section.hasAttribute("data-stack-item")) return;
        // The whole card, gently. This is the "the card itself moves" half.
        drift(panel, section, 34);
      });

      /* ── Interactions ─────────────────────────────────────────────
         `quickTo`, not a `gsap.to` per event: one reusable setter per
         element, instead of a fresh tween allocated on every pointermove. */
      const off: Array<() => void> = [];

      const on = <K extends keyof HTMLElementEventMap>(
        el: HTMLElement,
        type: K,
        fn: (e: HTMLElementEventMap[K]) => void,
      ) => {
        el.addEventListener(type, fn);
        off.push(() => el.removeEventListener(type, fn));
      };

      // Buttons lean toward the cursor and press down when clicked. The pull
      // is clamped to 5px — enough to feel live, not enough to slide the
      // label out from under the pointer.
      document
        .querySelectorAll<HTMLElement>(".lp-btn, .lnav__cta")
        .forEach((el) => {
          const x = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3" });
          const y = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3" });
          const scale = (to: number, duration: number, ease = "power2.out") =>
            gsap.to(el, { scale: to, duration, ease });

          on(el, "pointerenter", () => scale(1.035, 0.3));
          on(el, "pointermove", (e) => {
            const r = el.getBoundingClientRect();
            x(gsap.utils.clamp(-5, 5, (e.clientX - (r.left + r.width / 2)) / 5));
            y(gsap.utils.clamp(-5, 5, (e.clientY - (r.top + r.height / 2)) / 3));
          });
          on(el, "pointerleave", () => {
            x(0);
            y(0);
            scale(1, 0.3);
          });
          on(el, "pointerdown", () => scale(0.97, 0.12));
          on(el, "pointerup", () => scale(1.035, 0.25, "back.out(3)"));
        });

      /* Cards: where the pointer sits inside the card is where the accent
         wash sits — landing.css reads the coordinates back as --mx / --my.

         No lift, deliberately. Every card grid on this page is a hairline
         grid (1px gaps over a border-coloured background), so translating a
         cell would tear a border-coloured gap open beneath it. */
      document
        .querySelectorAll<HTMLElement>(".lp-feature, .lp-plan, .lp-facts__item")
        .forEach((el) => {
          on(el, "pointerenter", () => {
            el.dataset.hot = "";
          });
          on(el, "pointermove", (e) => {
            const r = el.getBoundingClientRect();
            el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
            el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
          });
          on(el, "pointerleave", () => {
            delete el.dataset.hot;
          });
        });

      return () => off.forEach((fn) => fn());
    });

    return () => mm.revert();
  });

  return null;
}
