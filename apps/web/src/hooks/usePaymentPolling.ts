"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

/**
 * Watch a mobile money payment until it resolves, or until waiting stops being
 * useful.
 *
 * Direct-pay has no redirect: the shopper approves a prompt on their handset and
 * the browser that started the charge stays where it is. So the browser has to
 * ask. This is the asking, and the shape of it is dictated by two facts about
 * Fapshi.
 *
 * **A direct-pay transaction never expires.** A hosted payment link lapses into
 * EXPIRED after a day; a direct charge does not. Its documented final states are
 * SUCCESSFUL and FAILED, and until the payer acts it stays PENDING indefinitely.
 * Nothing external will ever end the wait, so the timeout here is not a
 * convenience — it is the only thing that ends it.
 *
 * **Fapshi allows six status calls a minute per transaction.** The backend paces
 * its own calls behind a per-transaction gate, so polling faster than that gate
 * cannot reach Fapshi at all; it would only burn Koraa's own throttle. The
 * schedule below is therefore tuned to the shopper, not to the gateway: fast
 * while they are still looking at their phone, slower once they plainly are not.
 *
 * Timing out is **not** failing. A charge still pending at the timeout is
 * *unresolved* — the money may well have moved, and a webhook or the reconcile
 * sweep will finish the order without the browser. Callers must render `unknown`
 * as its own outcome; telling a shopper whose payment succeeded that it failed is
 * the worst thing this flow can do.
 */

/** How long to wait before a still-pending payment becomes `unknown`. */
export const POLL_TIMEOUT_MS = 180_000;

/**
 * 2s for the first ten seconds, then 5s for a minute, then 10s.
 *
 * The first window covers the shopper reading the prompt and pressing approve —
 * the common case, and where a fast answer is worth the requests. After a minute
 * they have put the phone down or are hunting for their PIN, and the backend's
 * own 10-second gate means a tighter interval buys nothing anyway.
 */
export function pollIntervalFor(elapsedMs: number): number {
  if (elapsedMs < 10_000) return 2_000;
  if (elapsedMs < 70_000) return 5_000;
  return 10_000;
}

export type PaymentOutcome = "pending" | "paid" | "failed" | "unknown";

/** The minimum a pollable endpoint must report. */
export interface Settleable {
  settled: boolean;
  payment_status: string;
}

export interface PaymentPollingResult<T> {
  /** `unknown` means unresolved, never failed. See the module docstring. */
  outcome: PaymentOutcome;
  /** The last successful response, for a reference number or an amount. */
  data: T | undefined;
  elapsedMs: number;
  /** True while the timeout has not yet been reached and nothing is settled. */
  waiting: boolean;
}

export function usePaymentPolling<T extends Settleable>({
  queryKey,
  enabled,
  fetcher,
  onPaid,
  onFailed,
  onTimeout,
}: {
  queryKey: unknown[];
  enabled: boolean;
  fetcher: () => Promise<T>;
  /** Fired once, on the transition to paid. Where a cart gets cleared. */
  onPaid?: (data: T) => void;
  onFailed?: (data: T) => void;
  onTimeout?: () => void;
}): PaymentPollingResult<T> {
  // Wall-clock rather than a poll counter: a tab the shopper backgrounded gets
  // its timers throttled by the browser, and counting polls there would let the
  // wait run for many minutes past the deadline.
  const startedAt = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  // Which watch this is. Disabling the hook does not unmount its observer, so
  // without this a second watch of the *same* order — a shopper correcting a
  // mistyped number and paying again — would read the first watch's settled
  // response on its very first render and report the old outcome before a single
  // request went out. Bumping the key makes each watch a distinct query, which
  // starts with no data.
  const [run, setRun] = useState(0);

  // Callbacks are held in a ref so a caller that passes an inline closure — the
  // normal way to write one — does not restart the timer on every render.
  const handlers = useRef({ onPaid, onFailed, onTimeout });
  handlers.current = { onPaid, onFailed, onTimeout };

  const fired = useRef<PaymentOutcome | null>(null);

  useEffect(() => {
    if (!enabled) {
      startedAt.current = null;
      setElapsedMs(0);
      setTimedOut(false);
      fired.current = null;
      // Next watch gets its own query rather than this one's final answer.
      setRun((n) => n + 1);
      return;
    }
    startedAt.current = Date.now();
    const tick = setInterval(() => {
      const began = startedAt.current;
      if (began === null) return;
      setElapsedMs(Date.now() - began);
    }, 1_000);
    return () => clearInterval(tick);
  }, [enabled]);

  const query = useQuery({
    queryKey: [...queryKey, run],
    queryFn: fetcher,
    enabled,
    // The whole point is a fresh answer; a cached one would report the state the
    // payment was in before the shopper approved it.
    staleTime: 0,
    gcTime: 0,
    // A single transient 5xx must not end the wait — money may be moving. The
    // timeout is what ends it.
    retry: 2,
    refetchInterval: (query) => {
      if (timedOut) return false;
      const latest = query.state.data as T | undefined;
      if (latest?.settled) return false;
      return pollIntervalFor(elapsedMs);
    },
    // Answering while the tab is hidden keeps the timeout honest: a shopper who
    // switches to their mobile money app to approve — which is most of them —
    // should come back to a finished order, not a stalled spinner.
    refetchIntervalInBackground: true,
  });

  const data = query.data;
  const settledStatus = data?.settled ? data.payment_status : null;

  let outcome: PaymentOutcome = "pending";
  if (settledStatus === "paid") outcome = "paid";
  else if (settledStatus) outcome = "failed";
  else if (timedOut) outcome = "unknown";

  useEffect(() => {
    if (!enabled || elapsedMs < POLL_TIMEOUT_MS) return;
    if (data?.settled) return;
    setTimedOut(true);
  }, [enabled, elapsedMs, data?.settled]);

  // Each terminal outcome notifies exactly once. `onPaid` clears carts and
  // invalidates caches, so a second call is not merely redundant.
  useEffect(() => {
    if (!enabled || outcome === "pending" || fired.current === outcome) return;
    fired.current = outcome;
    if (outcome === "paid" && data) handlers.current.onPaid?.(data);
    else if (outcome === "failed" && data) handlers.current.onFailed?.(data);
    else if (outcome === "unknown") handlers.current.onTimeout?.();
  }, [enabled, outcome, data]);

  return {
    outcome,
    data,
    elapsedMs,
    waiting: enabled && outcome === "pending",
  };
}
