// hooks/useGoogleAuth.ts — the "Continue with Google" button, in one place
//
// The sign-in and sign-up pages ran byte-identical copies of this logic apart
// from the referral code, which meant a bug in it was a bug in two files. It was:
// see WHY POPUP EVERYWHERE below.

"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import {
  consumeRedirectResult,
  signInWithGoogle,
  startGoogleRedirect,
  tookGoogleRedirect,
} from "@/lib/firebase";
import { socialAuthErrorMessage } from "@/lib/socialAuthError";
import { useAuthStore } from "@/stores/auth";

/**
 * WHY POPUP EVERYWHERE, INCLUDING MOBILE
 *
 * This used to sniff the user agent and send phones down `signInWithRedirect`,
 * on the reasonable-sounding theory that popups are awkward on a small screen.
 * That silently broke Google sign-in on every phone.
 *
 * `signInWithRedirect` hands off to `<project>.firebaseapp.com/__/auth/handler`
 * and needs to read the state it left behind when the browser comes back. Since
 * Firebase JS SDK 9.13 that read fails wherever third-party storage is
 * partitioned — which is Safari with ITP (so every iPhone browser, all of them
 * being WebKit), and Chrome and Firefox with their equivalents. The failure is
 * not an exception: `getRedirectResult` resolves `null`, indistinguishable from
 * "no redirect was pending", so the page came back from Google and did nothing
 * at all. Nothing to retry, nothing in the console, no toast.
 *
 * Firebase's own guidance is now the reverse of the old advice: prefer popup,
 * and only use redirect if you serve the auth handler from your own origin (a
 * reverse proxy for /__/auth/*, or a custom auth domain) so the storage is
 * first-party. Mobile browsers open a popup as a tab and hand it back on
 * completion, which works.
 *
 * Redirect is kept strictly as a fallback for the environments that genuinely
 * cannot open a window — see REDIRECT_FALLBACK_CODES. Those are also the
 * environments most likely to hit the partitioning problem, so the return leg
 * below reports a null result as a failure rather than staying quiet.
 */

/**
 * Popup failures where retrying the popup is pointless but a redirect may work.
 *
 * Deliberately not `auth/popup-closed-by-user` or
 * `auth/cancelled-popup-request`: the user closing the window is an answer, and
 * navigating them away to Google in response to it would be a hijack.
 */
const REDIRECT_FALLBACK_CODES = new Set([
  // A blocker, or a click the browser no longer considers recent.
  "auth/popup-blocked",
  // In-app browsers (the Facebook, Instagram and WhatsApp webviews, which is a
  // lot of traffic in this market) cannot open a second window at all.
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
]);

type UseGoogleAuthOptions = {
  /** Passed through to the API on sign-up. Ignored once an account exists. */
  referralCode?: string;
  /** Copy differs between the two pages only in the word for what happened. */
  verb?: "sign-in" | "sign-up";
};

/**
 * Wires up Google auth for a page: completes a returning redirect on mount, and
 * returns the click handler for the button.
 */
export function useGoogleAuth({ referralCode }: UseGoogleAuthOptions = {}) {
  const router = useRouter();

  /**
   * Trades a Firebase ID token for a Koraa session and goes where the account
   * belongs. New accounts have no merchant yet and must onboard before the
   * dashboard has anything to show them.
   */
  const completeSession = useCallback(
    async (idToken: string) => {
      useAuthStore.setState({ isLoading: true });
      try {
        await useAuthStore
          .getState()
          .socialLogin("google", idToken, undefined, referralCode || undefined);
        const user = useAuthStore.getState().user;
        if (user && !user.has_merchant) {
          toast.success("Account connected! Let's set up your store.");
          router.push("/auth/onboarding");
        } else {
          toast.success("Welcome back!");
          router.push("/dashboard");
        }
      } finally {
        useAuthStore.setState({ isLoading: false });
      }
    },
    [referralCode, router],
  );

  // Completes a sign-in that left the page for Google. `consumeRedirectResult`
  // is single-flight, which is what makes this safe under React Strict Mode —
  // it double-invokes effects in development, and two concurrent
  // `getRedirectResult` calls race over one shared Firebase event stream and
  // trip an internal assertion. See the note in lib/firebase.ts.
  useEffect(() => {
    // Read before the first await, so the double-invoked effect cannot both
    // claim the return leg and report the same outcome twice.
    const returning = tookGoogleRedirect();

    void (async () => {
      try {
        const result = await consumeRedirectResult();

        if (!result) {
          // No redirect pending is the ordinary case on a plain page visit, and
          // there is nothing to say about it. But if this page load IS the
          // return leg from Google, a null result means the SDK could not read
          // the state it left — partitioned third-party storage, the failure
          // described at the top of this file. Saying nothing is what made that
          // bug invisible for as long as it lasted.
          if (returning) {
            toast.error(
              "Google could not complete sign-in in this browser. Please use email and password.",
            );
          }
          return;
        }

        await completeSession(await result.user.getIdToken());
      } catch (err) {
        // Only worth reporting if a redirect actually happened. On an ordinary
        // visit there is no sign-in in progress to have failed, and a toast
        // here would be about nothing.
        const message = socialAuthErrorMessage(err);
        if (returning && message) toast.error(message);
      }
    })();
  }, [completeSession]);

  const signIn = useCallback(async () => {
    try {
      await completeSession(await signInWithGoogle());
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code ?? "";

      // A popup the browser refused to open is not a failed sign-in, and
      // telling the user it was leaves them stuck on a button that can never
      // work. Finish the same sign-in without a popup: the redirect leaves the
      // page and the effect above picks the result up on the way back.
      if (REDIRECT_FALLBACK_CODES.has(code)) {
        try {
          useAuthStore.setState({ isLoading: true });
          await startGoogleRedirect();
          return;
        } catch {
          useAuthStore.setState({ isLoading: false });
        }
      }

      // Everything else — a closed popup, an unauthorized domain, a build with
      // no Firebase credentials, an unreachable API, a token the backend would
      // not take. The helper logs the real error and answers null for the cases
      // that are not worth a toast.
      const message = socialAuthErrorMessage(err);
      if (message) toast.error(message);
    }
  }, [completeSession]);

  return { signIn };
}
