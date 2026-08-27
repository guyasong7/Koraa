// lib/socialAuthError.ts — turning a failed social sign-in into something sayable
//
// Google sign-in is two round trips wearing one button: Firebase mints an ID
// token in the browser, then `socialLogin` trades it with the Koraa API for a
// session. Both legs land in the same `catch`, so a single blanket message ends
// up standing in for a blocked popup, a misconfigured build, an unreachable
// backend and a rejected token alike.
//
// That is not hypothetical. A Vercel deploy built without KORAA_PUBLIC_* shipped
// `apiKey: ""` and an API base of `http://localhost:8000/api/v1`; every attempt
// failed, and all anyone could see was "Google login failed. Please try again."
// — advice to retry something that could not work. This module keeps the real
// error in the console and gives the user the one sentence that fits.

import { FIREBASE_NOT_CONFIGURED } from "./firebase";

/** Codes the caller handles as control flow, not as something to report. */
const SILENT = new Set([
  // The user shut the popup, or opened a second one which cancels the first.
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
]);

type Errorish = {
  code?: unknown;
  message?: unknown;
  response?: { status?: unknown; data?: unknown };
};

function codeOf(err: unknown): string {
  const code = (err as Errorish | null)?.code;
  return typeof code === "string" ? code : "";
}

/**
 * The message to show for a failed social sign-in, or `null` to stay quiet.
 *
 * Always logs the underlying error first: these paths are the ones a user
 * reports as "login is broken", and the console is the only place the actual
 * code survives once the toast has been written.
 *
 * `provider` names the button that was pressed, so the copy matches what the
 * user did rather than always saying Google.
 */
export function socialAuthErrorMessage(
  err: unknown,
  provider = "Google",
): string | null {
  console.error(`[auth] ${provider} sign-in failed:`, err);

  const code = codeOf(err);
  if (SILENT.has(code)) return null;

  // This build has no Firebase credentials. Retrying cannot help, and neither
  // can switching to email — the API base is usually missing from the same
  // build — so say what is actually wrong.
  if (code === FIREBASE_NOT_CONFIGURED || code === "auth/invalid-api-key") {
    return "Sign-in is not configured on this deployment. Please contact support.";
  }

  // Not in Firebase Console -> Authentication -> Authorized domains. Email and
  // password still work, so point there.
  if (code === "auth/unauthorized-domain") {
    return `${provider} sign-in is not enabled for this domain. Please use email and password instead.`;
  }

  if (code === "auth/account-exists-with-different-credential") {
    return "That email is already registered with a different sign-in method. Try email and password.";
  }

  if (code === "auth/network-request-failed") {
    return "Could not reach Google. Check your connection and try again.";
  }

  // The Firebase leg succeeded and the Koraa API leg did not. `ERR_NETWORK`
  // covers DNS failure, a refused connection and a browser-blocked request —
  // including the mixed-content block an https page gets when the API base is
  // http, which is what a build missing KORAA_PUBLIC_API_URL produces.
  if (code === "ERR_NETWORK" || code === "ECONNABORTED") {
    return "Could not reach the Koraa server. Please try again in a moment.";
  }

  const status = (err as Errorish | null)?.response?.status;
  if (typeof status === "number") {
    // The backend rejected the Firebase token. Most often FIREBASE_PROJECT_ID on
    // the API naming a different project than the one that minted it.
    if (status === 400 || status === 401 || status === 403) {
      return "We could not verify that account. Please try again or use email and password.";
    }
    if (status >= 500) {
      return "The Koraa server had a problem completing sign-in. Please try again.";
    }
  }

  return `${provider} sign-in failed. Please try again.`;
}
