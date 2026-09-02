// lib/firebaseAction.ts
//
// Thin wrappers around the Firebase Auth SDK methods needed by the
// custom action-URL handler (/_/auth/action). Kept separate from
// lib/firebase.ts so the action page can import them with a single
// dynamic `import()` rather than pulling in the full auth helper surface.
//
// The module is intentionally side-effect free — no singletons here —
// so tree-shaking can trim it from every bundle that does not touch it.

import { getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  applyActionCode as _applyActionCode,
  checkActionCode as _checkActionCode,
  confirmPasswordReset as _confirmPasswordReset,
  type ActionCodeInfo,
} from "firebase/auth";

const firebaseConfig = {
  apiKey:            process.env.KORAA_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.KORAA_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.KORAA_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.KORAA_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.KORAA_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.KORAA_PUBLIC_FIREBASE_APP_ID,
};

function auth() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return getAuth(app);
}

/**
 * Namespace-style export so the action page can write:
 *
 *   const { loadFirebaseAction } = await import("@/lib/firebaseAction");
 *   await loadFirebaseAction.applyActionCode(code);
 *
 * Matches the dynamic-import pattern used in the rest of this codebase.
 */
export const loadFirebaseAction = {
  /** Verifies an email address or un-revokes an email change. */
  async applyActionCode(oobCode: string): Promise<void> {
    await _applyActionCode(auth(), oobCode);
  },

  /**
   * Returns metadata about an action code without consuming it.
   * Used by the email-recovery path to discover the restored address.
   */
  async checkActionCode(oobCode: string): Promise<ActionCodeInfo> {
    return _checkActionCode(auth(), oobCode);
  },

  /** Completes a password-reset flow using the one-time code from email. */
  async confirmPasswordReset(oobCode: string, newPassword: string): Promise<void> {
    await _confirmPasswordReset(auth(), oobCode, newPassword);
  },
};
