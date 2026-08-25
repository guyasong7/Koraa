"use client";

/**
 * The only interactive parts of the landing page.
 *
 * `page.tsx` is a server component so the pricing table — which it fetches
 * from `/payments/plans/` — ends up in the HTML rather than appearing after
 * hydration. These two pieces need state, so they live here and take the
 * server-rendered content as `children`.
 */

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LuMinus, LuPlus } from "react-icons/lu";

/** One question. Collapsed by default; the whole row is the target. */
export function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  return (
    <div className="lp-faq__item">
      <button
        type="button"
        className="lp-faq__q"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{q}</span>
        <span className="lp-faq__icon" aria-hidden="true">
          {open ? <LuMinus size={20} /> : <LuPlus size={20} />}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="lp-faq__a"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <p>{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Fades its children up as they scroll into view, once.
 *
 * Returns the children untouched under `prefers-reduced-motion`, rather
 * than animating with a zero duration — that way there is no transform on
 * the element at all, which also keeps it out of the compositor.
 */
export function Reveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
