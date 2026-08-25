"use client";

import { useEffect } from "react";
import Lenis from "@studio-freight/lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Smooth scrolling for the landing page.
 *
 * The card deck reads better with momentum under it: a wheel notch moves the
 * native scroll in one jump, so a pinned card covering the one beneath it
 * arrives in steps. Lenis turns each notch into a short animation, and the
 * deck — which is a pure function of `window.scrollY` — follows for free.
 *
 * Renders nothing, and is mounted only under `(landing)`. The dashboard and
 * the auth screens keep native scrolling: they have forms, long tables and
 * scroll containers of their own, and hijacking the wheel there costs more
 * than it gives.
 *
 * Three things have to be true for this not to fight the rest of the page:
 *
 *   * ScrollTrigger has to be told when Lenis has moved. Lenis writes the
 *     real window scroll position every frame, so it only needs the tick,
 *     not a `scrollerProxy` — see below for why a proxy is wrong here.
 *   * Only one thing may drive the rAF loop. GSAP's ticker already runs one
 *     for every tween on the page, so Lenis is driven from it rather than
 *     from a second `requestAnimationFrame` of its own.
 *   * `scroll-behavior: smooth` in globals.css has to be off while this runs.
 *     Native smooth scrolling and Lenis both animate the same scrollTop, and
 *     the page would be pulled by both at once. That switch lives in CSS —
 *     `.lenis.lenis-smooth` — because ScrollTrigger rewrites the property
 *     inline after every refresh and would undo a JS one. Switching it off
 *     makes the page's hash links this component's problem, so it handles
 *     them too.
 */
export default function SmoothScroll() {
  useEffect(() => {
    /* Anyone who has asked for less motion gets the browser's own scrolling.
       Checked here rather than in CSS because there is nothing to style —
       the whole behaviour is this effect not running. */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      /* A little over half a second to settle. Long enough to read as
         momentum, short enough that a reader driving the page with the
         wheel never feels held back by it. */
      duration: 0.9,
      /* Expo-out: most of the distance is covered immediately and the tail
         is what decays, so the page responds on the same frame as the wheel
         notch instead of easing into motion. */
      easing: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      /* Touch is left native. A phone's own scrolling is already smooth and
         is handled by the compositor; taking it over costs a frame of
         latency on exactly the devices with the least to spare — and the
         deck does not run at those widths anyway. */
      syncTouch: false,
    });

    /* No `scrollerProxy`. It is what the Lenis integration needs when Lenis
       is driving a wrapper element, because then the window's own scroll
       position is meaningless and ScrollTrigger has to be told where to
       look. Here Lenis is on the window: every frame it writes the real
       native scroll position, so `window.scrollY` is already Lenis's
       interpolated value and ScrollTrigger reading it directly is correct.

       A proxy was tried and measurably broke the card deck — ScrollTrigger
       stopped firing its `onUpdate` and the panels scrolled past the nav
       unpinned. Do not add one back for a window-scrolled Lenis. All the
       integration needs is the two lines below. */

    /* Lenis emits on every frame it moves. ScrollTrigger normally listens to
       the native scroll event, which Lenis does fire — but it fires it after
       writing the new position, so updating from here instead keeps the two
       in the same frame. */
    lenis.on("scroll", ScrollTrigger.update);

    /* One rAF loop for the page. GSAP's ticker is already running one, so
       Lenis rides it; a second loop would mean two wake-ups per frame and no
       ordering guarantee between them. The ticker reports seconds and Lenis
       wants milliseconds. */
    const drive = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(drive);

    /* GSAP's ticker smooths its delta by default, which is right for tweens
       and wrong for a scroll integrator: a dropped frame would be handed to
       Lenis as a normal one and the page would fall behind the wheel. */
    gsap.ticker.lagSmoothing(0);

    /* `scroll-behavior: smooth` is switched off in globals.css, keyed on the
       classes Lenis puts on `<html>` — not from here. It cannot be done from
       here: ScrollTrigger writes the property back onto the element as an
       inline style after every refresh, so whatever this effect set would be
       overwritten within a frame. The comment on `.lenis.lenis-smooth` in
       globals.css has the details.

       Which makes the in-page anchors this component's problem: `/#features`,
       `/#payments`, `/#pricing` and `/#faq` were smooth only because of the
       rule that CSS now switches off, and Lenis 1.0.42 has no `anchors`
       option to hand them to.

       Capture phase, on the document. Next's Link runs its own click handler
       from React's listener on the root and bails out when the event is
       already `defaultPrevented` — see the `e.defaultPrevented` guard in
       `next/dist/client/link.js` — and capture at the document runs before
       that. So preventing the default is enough on its own; there is no need
       to stop propagation and take unrelated handlers down with it. */
    const onAnchorClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      /* Same document only. A hash pointing at another page is a navigation,
         and Next has to be the one to make it. Reading `anchor.href` rather
         than the attribute resolves `#pricing` and `/#pricing` alike. */
      const url = new URL(anchor.href);
      if (url.origin !== location.origin) return;
      if (url.pathname !== location.pathname || url.search !== location.search) {
        return;
      }
      if (!url.hash || url.hash === "#") return;

      const id = decodeURIComponent(url.hash.slice(1));
      const target =
        document.getElementById(id) ?? document.getElementsByName(id)[0];
      if (!target) return;

      event.preventDefault();
      /* No offset. Native smooth scrolling put the target's own top at the
         top of the viewport, and every hash target here is a section whose
         top padding already clears the fixed nav, so an offset would only
         add air that was never there. */
      lenis.scrollTo(target);
      /* Leaves the address bar and the back button where they were. Next
         patches `pushState` to copy its router state onto the new entry, so
         this stays an entry the app router recognises rather than one that
         makes Back reload the page. */
      history.pushState(null, "", url.hash);
    };
    document.addEventListener("click", onAnchorClick, true);

    return () => {
      document.removeEventListener("click", onAnchorClick, true);
      gsap.ticker.remove(drive);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.off("scroll", ScrollTrigger.update);
      lenis.destroy();
      ScrollTrigger.refresh();
    };
  }, []);

  return null;
}
