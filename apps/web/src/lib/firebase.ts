// lib/firebase.ts — Firebase app + auth, loaded on demand
// All config values come from .env.local (KORAA_PUBLIC_ prefix, declared in
// next.config.ts so they reach the browser — see the comment there)

import type {
  Auth,
  ConfirmationResult,
  RecaptchaVerifier,
  User,
  UserCredential,
} from "firebase/auth";

const firebaseConfig = {
  apiKey:            process.env.KORAA_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.KORAA_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.KORAA_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.KORAA_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.KORAA_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.KORAA_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Why the SDK is loaded dynamically, and why every export below is async.
 *
 * `firebase/auth` is the largest dependency any page in this app pulls in, and
 * it cannot be trimmed: `@firebase/auth` ships one bundled `dist/esm/index.js`
 * and declares no `sideEffects: false`, so importing `signInWithPopup` and
 * importing the whole module cost exactly the same. Splitting phone auth out of
 * this file, for instance, saves nothing at all — the only lever is *when* it
 * loads, not how much of it does.
 *
 * This module used to call `getAuth(app)` at module scope and export the
 * instance. That made the auth bundle part of the initial JavaScript of every
 * route that touched it — both sign-in pages, the password reset page and the
 * dashboard settings page — so it had to download, parse and execute before
 * those pages could hydrate. Nobody can sign in during that window anyway: the
 * form is not interactive yet.
 *
 * Now it is a separate chunk fetched after hydration. The form works first, the
 * SDK arrives while the user is typing their email, and the pages that only
 * need it on a button press do not pay for it on arrival.
 *
 * The cost of that is this file's shape: nothing can hand out an `Auth`
 * synchronously, so `auth` is no longer exported and every operation is a
 * function that awaits the load. That is deliberate — an exported `auth` would
 * be a synchronous view of an asynchronous thing, and the only honest way to
 * offer one is to go back to loading it eagerly.
 */

type AuthSdk = typeof import("firebase/auth");

let sdkLoad: Promise<{ auth: Auth; sdk: AuthSdk }> | null = null;

function loadAuth(): Promise<{ auth: Auth; sdk: AuthSdk }> {
  if (sdkLoad) return sdkLoad;

  const attempt = (async () => {
    // Both imports at once: `firebase/app` is small and independent, so
    // sequencing them would add a round trip for nothing.
    const [{ getApps, initializeApp }, sdk] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
    ]);
    // Singleton — avoid re-initialising on hot reload.
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    return { auth: sdk.getAuth(app), sdk };
  })().catch((err) => {
    // A failed chunk fetch must not be remembered. Caching the rejection would
    // mean one dropped request on a flaky mobile connection makes every later
    // attempt fail instantly with the same stale error, so the retry the user
    // is being invited to make could never succeed.
    sdkLoad = null;
    throw err;
  });

  sdkLoad = attempt;
  return attempt;
}

/**
 * The signed-in Firebase user, once Firebase is sure who that is.
 *
 * `auth.currentUser` is null until the persisted session has been restored from
 * IndexedDB, which is asynchronous. With the SDK loaded eagerly that had
 * usually finished long before anything read it; now that the load starts on a
 * click, it has certainly not. `authStateReady` is what stops that timing
 * change from reporting a signed-in merchant as signed out.
 */
async function session(): Promise<{ user: User | null; sdk: AuthSdk }> {
  const { auth, sdk } = await loadAuth();
  await auth.authStateReady();
  return { user: auth.currentUser, sdk };
}

// ── Providers ──────────────────────────────────────────────────

/**
 * Built per call rather than held as a module singleton. A provider is a plain
 * bag of scopes and parameters, so there is nothing to reuse, and a singleton
 * would have to be created inside the async load anyway — leaving an export
 * that is undefined until someone signs in.
 */
function googleProvider(sdk: AuthSdk) {
  const provider = new sdk.GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  return provider;
}

// ── Helper functions ───────────────────────────────────────────

/**
 * Why every popup/redirect call below is single-flight.
 *
 * Firebase runs popup and redirect sign-in through one shared `AuthEventManager`
 * per auth instance. Each attempt registers itself as a consumer, holds the
 * promise it must settle in `pendingPromise`, and nulls that field the moment it
 * settles. Two attempts running at once therefore race over one event stream,
 * and the loser settles a promise that is already gone — which surfaces as:
 *
 *   @firebase/auth: "Auth (12.17.0): INTERNAL ASSERTION FAILED:
 *   Pending promise was never set"
 *
 * `getRedirectResult` is the easy one to trip, because it has no internal guard:
 * it memoises its answer only *after* awaiting, and the pending-redirect flag it
 * reads is deleted in the same step. So two concurrent callers both proceed and
 * both consume. React makes that the default rather than the exception — Strict
 * Mode double-invokes effects in development, so an unguarded
 * `getRedirectResult` in a `useEffect` fires twice on every single mount.
 *
 * The fix is to share one in-flight operation instead of starting a second.
 * Cleared once settled, so a later retry still works — the hazard is
 * concurrency, not repetition.
 */

let popupInFlight: Promise<string> | null = null;

/**
 * Opens Google sign-in popup and returns the Firebase ID token.
 *
 * A popup has to be opened while the browser still considers the click recent,
 * so this is the one path where the deferred load has a cost: if the chunk has
 * not arrived, the window opens after a network fetch and Safari and Firefox
 * will block it. Two things keep that from happening. The sign-in pages call
 * `consumeRedirectResult` on mount, which loads the SDK as soon as the page
 * hydrates — long before a human can aim at the button — so by click time this
 * resolves from an already-settled promise, within the click's own task. And
 * for the case where someone is faster than the network, both callers fall back
 * to `startGoogleRedirect` on `auth/popup-blocked`, which needs no popup at all.
 */
export function signInWithGoogle(): Promise<string> {
  // A double-clicked button gets the first popup's token rather than a second
  // popup, which the browser would likely block anyway.
  if (popupInFlight) return popupInFlight;

  const attempt = loadAuth()
    .then(({ auth, sdk }) => sdk.signInWithPopup(auth, googleProvider(sdk)))
    .then((result: UserCredential) => result.user.getIdToken())
    .finally(() => {
      popupInFlight = null;
    });
  popupInFlight = attempt;
  return attempt;
}

let redirectInFlight: Promise<UserCredential | null> | null = null;

/**
 * The result of a completed Google redirect, or `null` if none is pending.
 *
 * Safe to call from an effect that React may run more than once: concurrent
 * callers share one operation. Call this rather than `getRedirectResult`, which
 * is deliberately not exposed by this module.
 *
 * Called unconditionally on mount by the sign-in pages, and not gated behind
 * `tookGoogleRedirect`. That gate would let an ordinary visitor avoid loading
 * the SDK until they click, which is tempting, but the flag lives in
 * sessionStorage and private browsing can refuse to store it — and then the
 * return leg of a real redirect would never be consumed and the sign-in would
 * silently do nothing. Loading a chunk nobody ends up using is a smaller
 * failure than that.
 */
export function consumeRedirectResult(): Promise<UserCredential | null> {
  if (redirectInFlight) return redirectInFlight;

  const attempt = loadAuth()
    .then(({ auth, sdk }) => sdk.getRedirectResult(auth))
    .finally(() => {
      redirectInFlight = null;
    });
  redirectInFlight = attempt;
  return attempt;
}

// Survives the trip to Google and back, because sessionStorage is per-tab and
// outlives navigation. Firebase keeps its own pending flag but does not expose
// it, and it is cleared by the read that consumes it.
const REDIRECT_FLAG = "koraa:google-redirect";

/** Leaves the page for Google, remembering that we did so. */
export async function startGoogleRedirect(): Promise<void> {
  try {
    sessionStorage.setItem(REDIRECT_FLAG, "1");
  } catch {
    // Private browsing, or storage disabled. The sign-in still works; only the
    // error-reporting hint below is lost.
  }
  const { auth, sdk } = await loadAuth();
  await sdk.signInWithRedirect(auth, googleProvider(sdk));
}

/**
 * Whether this page load is the return leg of a Google redirect. Consumes the
 * marker, so it answers true once.
 *
 * Used to decide whether a failed `consumeRedirectResult` is worth telling the
 * user about. On an ordinary visit to the sign-in page there is no redirect to
 * report on, and "Google authentication failed" would be about nothing.
 */
export function tookGoogleRedirect(): boolean {
  try {
    const took = sessionStorage.getItem(REDIRECT_FLAG) === "1";
    if (took) sessionStorage.removeItem(REDIRECT_FLAG);
    return took;
  } catch {
    return false;
  }
}

/**
 * Sign out of Firebase.
 *
 * Called by the auth store's `logout` alongside clearing the Koraa tokens.
 * Both halves are needed: dropping only the Koraa tokens leaves a live Firebase
 * session in this browser's IndexedDB, which can mint a fresh ID token and
 * trade it back for a Koraa session — so on a shared device "log out" would not
 * have logged anyone out.
 */
export async function firebaseSignOut(): Promise<void> {
  const { auth, sdk } = await loadAuth();
  await sdk.signOut(auth);
}

// ── Email/Password Auth ────────────────────────────────────────

// The raw `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`,
// `sendEmailVerification`, `sendPasswordResetEmail` and `updateProfile` are not
// re-exported: each one takes the `Auth` or `User` this module no longer hands
// out. The task-shaped wrappers below take their place. Firebase's error codes
// pass straight through them, so callers keep matching on `err.code`.

/** Signs in with an email and password, returning the Firebase ID token. */
export async function signInWithEmail(email: string, password: string): Promise<string> {
  const { auth, sdk } = await loadAuth();
  const result = await sdk.signInWithEmailAndPassword(auth, email, password);
  return result.user.getIdToken();
}

/**
 * Creates an account, names it, asks Firebase to send the verification email,
 * and returns the ID token to exchange for a Koraa session.
 */
export async function registerWithEmail(
  email: string,
  password: string,
  fullName: string
): Promise<string> {
  const { auth, sdk } = await loadAuth();
  const result = await sdk.createUserWithEmailAndPassword(auth, email, password);
  await sdk.updateProfile(result.user, { displayName: fullName });

  try {
    await sdk.sendEmailVerification(result.user);
  } catch {
    // The account already exists by this point, so a rejection here must not
    // reject the sign-up. It used to: a rate-limited verification email
    // reported the whole registration as failed, and the retry it invited came
    // back "email-already-in-use" — the user locked out of an account that had
    // been created perfectly well. Settings has a resend button for this.
  }

  return result.user.getIdToken();
}

/** Asks Firebase to email a password-reset link. */
export async function sendPasswordReset(email: string): Promise<void> {
  const { auth, sdk } = await loadAuth();
  await sdk.sendPasswordResetEmail(auth, email);
}

/**
 * Re-sends the address-verification email to the signed-in user.
 *
 * Answers `false` rather than throwing when Firebase has no session, because
 * that is not an error the user can act on the same way as a rate limit — it
 * means their Firebase session expired while their Koraa one did not, and the
 * fix is to sign in again.
 */
export async function sendVerificationEmail(): Promise<boolean> {
  const { user, sdk } = await session();
  if (!user) return false;
  await sdk.sendEmailVerification(user);
  return true;
}

/**
 * Re-checks whether the user has followed the link in their verification email.
 * Returns a fresh ID token if they have, so the caller can hand it to the
 * backend, and `null` if they have not.
 */
export async function refreshEmailVerification(): Promise<string | null> {
  const { user } = await session();
  if (!user) return null;

  await user.reload();
  if (!user.emailVerified) return null;

  // Forced refresh. The cached token still carries `email_verified: false`, and
  // that claim is exactly what the backend reads to flip the account over.
  return user.getIdToken(true);
}

// ── Phone Auth ─────────────────────────────────────────────────

let recaptchaVerifier: RecaptchaVerifier | null = null;

/**
 * Initialise an invisible reCAPTCHA widget attached to `containerId`
 * then send a Firebase SMS to `phoneNumber` (E.164 format, e.g. +237XXXXXXXXX).
 * Returns the ConfirmationResult needed to verify the code.
 */
export async function sendPhoneOTP(
  phoneNumber: string,
  containerId: string
): Promise<ConfirmationResult> {
  const { auth, sdk } = await loadAuth();

  // Tear down any previous verifier first
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
  }

  recaptchaVerifier = new sdk.RecaptchaVerifier(auth, containerId, {
    size: "invisible",
    callback: () => {},
  });

  const confirmationResult = await sdk.signInWithPhoneNumber(
    auth,
    phoneNumber,
    recaptchaVerifier
  );
  return confirmationResult;
}

/**
 * Verify the 6-digit SMS code that Firebase sent.
 * Returns the Firebase UID on success.
 */
export async function verifyPhoneOTP(
  confirmationResult: ConfirmationResult,
  code: string
): Promise<string> {
  const result = await confirmationResult.confirm(code);
  return result.user.uid;
}
