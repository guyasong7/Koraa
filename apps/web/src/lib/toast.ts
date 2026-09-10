import { toast as sonnerToast } from "sonner";

/**
 * sonner's `toast`, with react-hot-toast's success timing preserved.
 *
 * The two libraries disagree on one visible default. react-hot-toast used a
 * per-type table — `blank: 4000, error: 4000, success: 2000` — while sonner
 * has a single `TOAST_LIFETIME = 4000` for every type. Swapping libraries
 * therefore doubled how long all 65 success toasts sat on screen, and
 * sonner's `<Toaster toastOptions>` takes one flat `duration`, so it cannot
 * express the difference.
 *
 * Import `toast` from here rather than from "sonner" directly. Everything
 * else is passed straight through: error and the bare `toast()` already match
 * at 4000ms, and loading toasts never auto-dismiss in either library.
 */
const SUCCESS_DURATION_MS = 2000;

type SonnerToast = typeof sonnerToast;

/**
 * A caller's own `duration` still wins — the spread is after the default.
 *
 * Passing `duration` also matters for the `toast.success(msg, { id })` sites
 * that promote a loading toast in place: sonner merges the new options over
 * the existing toast, so without a duration here the promoted toast would
 * keep resolving to the 4000ms default.
 */
const success: SonnerToast["success"] = (message, data) =>
  sonnerToast.success(message, { duration: SUCCESS_DURATION_MS, ...data });

export const toast: SonnerToast = Object.assign(
  ((...args: Parameters<SonnerToast>) => sonnerToast(...args)) as SonnerToast,
  sonnerToast,
  { success },
);
