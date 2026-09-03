"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthStore } from "@/stores/auth";

/** How long a session survives with no interaction. */
const IDLE_LIMIT_MS = 10 * 60 * 1000;

/** How often the idle check runs while the tab is in the foreground. */
const POLL_MS = 20 * 1000;

/** One write per this interval, however much the user moves. */
const WRITE_THROTTLE_MS = 15 * 1000;

const ACTIVITY_KEY = "koraa_last_activity";

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
] as const;

function readLastActivity(): number {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

/**
 * Ends the session after ten idle minutes, or the moment the browser goes
 * offline.
 *
 * Mounted by the dashboard layout rather than by AppProviders, which also wraps
 * /auth and both storefront routes — an idle timer there would arm on the login
 * page and on public shop pages, where there is no session to end and a shopper
 * browsing for eleven minutes is a customer, not a risk.
 *
 * The activity timestamp lives in localStorage, not a ref, for two reasons: it
 * survives a reload, so refreshing the page is not a way to reset the clock;
 * and it is shared between tabs, so working in one tab does not let an idle
 * sibling expire the session out from under it.
 *
 * The interval alone is not enough. Browsers throttle timers in background
 * tabs, so a tab left for an hour would keep its session alive until its next
 * tick — hence the checks on `visibilitychange` and `focus`, which fire the
 * moment the tab is looked at again.
 */
export default function SessionGuard() {
  const router = useRouter();

  useEffect(() => {
    let expired = false;

    const expire = (reason: "idle" | "offline") => {
      // Whichever trigger fires first wins; the second must not fire a
      // redirect at a session that is already being torn down.
      if (expired || !useAuthStore.getState().isAuthenticated) return;
      expired = true;

      try {
        localStorage.removeItem(ACTIVITY_KEY);
      } catch {
        // Nothing to do: the session is ending regardless.
      }
      // `logout` wraps both of its network calls and clears local state either
      // way, so this is safe with no connection — which is exactly the case
      // the offline trigger runs in.
      void useAuthStore.getState().logout();
      router.replace(`/auth/login?reason=${reason}`);
    };

    let lastWrite = 0;
    const noteActivity = () => {
      const now = Date.now();
      if (now - lastWrite < WRITE_THROTTLE_MS) return;
      lastWrite = now;
      try {
        localStorage.setItem(ACTIVITY_KEY, String(now));
      } catch {
        // Private browsing or a full quota. Losing the write costs an early
        // logout, which is the safe direction to fail in.
      }
    };

    const checkIdle = () => {
      const last = readLastActivity();
      // A missing timestamp means this session predates the guard, or storage
      // was cleared. Treat it as fresh rather than expiring on sight.
      if (!last) {
        noteActivity();
        return;
      }
      if (Date.now() - last > IDLE_LIMIT_MS) expire("idle");
    };

    // Seed the clock so a page loaded and left alone still expires.
    noteActivity();

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, noteActivity, { passive: true });
    }
    const interval = window.setInterval(checkIdle, POLL_MS);
    const onOffline = () => expire("offline");
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", checkIdle);
    document.addEventListener("visibilitychange", checkIdle);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, noteActivity);
      }
      window.clearInterval(interval);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", checkIdle);
      document.removeEventListener("visibilitychange", checkIdle);
    };
  }, [router]);

  return null;
}
