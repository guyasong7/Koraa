"use client";

import { preconnect, prefetchDNS } from "react-dom";

/**
 * Opens the TLS connections Firebase auth is about to need, while the user is
 * still reading the form.
 *
 * Signing in touches four origins that the page itself never loads anything
 * from, so the browser has no reason to have connected to any of them. Without
 * these hints the DNS lookup, TCP handshake and TLS negotiation for each one
 * happen *after* the click — three round trips before a single byte of the
 * sign-in request moves. On a Cameroonian mobile connection with a 150–300ms
 * RTT that is most of the half-second between pressing the button and anything
 * appearing to happen. Doing it during page load overlaps it with the user
 * reading the form, which costs them nothing.
 *
 * `preconnect` versus `prefetchDNS`: preconnect completes the whole handshake
 * and holds the socket for a few seconds, so it is worth spending only on
 * origins that are hit on the very next action. prefetchDNS resolves the name
 * and stops, which is the right price for origins that come into play a step
 * later.
 *
 * The `crossOrigin` argument is not decoration. A connection opened for
 * anonymous CORS requests lives in a different pool from one opened for
 * ordinary document and script loads, so a hint that does not match how the
 * resource is actually fetched opens a socket the real request cannot reuse —
 * a wasted connection that looks like an optimisation. Hence: the Identity
 * Toolkit REST API is reached by `fetch`, so it is CORS; the gapi script and
 * the Firebase auth handler are a classic script and a document, so they are
 * not.
 *
 * Applies to everything under /auth, including onboarding, which does not sign
 * anyone in. That is deliberate — onboarding is only ever reached *from* a
 * sign-in, so its connections are already open and the hints are no-ops there.
 */
export default function AuthPreconnect() {
  // The REST endpoint behind every email sign-in, every registration, and the
  // token exchange that finishes a Google sign-in. Always hit, always by fetch.
  preconnect("https://identitytoolkit.googleapis.com", { crossOrigin: "anonymous" });

  // Firebase loads https://apis.google.com/js/api.js to host the hidden iframe
  // it uses to receive popup and redirect results. A blocking script fetch, so
  // this is the hint that pays for itself fastest on the Google path.
  preconnect("https://apis.google.com");

  // The project's own auth domain serves /__/auth/handler (the popup) and
  // /__/auth/iframe. Guarded because the variable is inlined at build time and
  // a build without Firebase configured would otherwise emit "https://undefined".
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  if (authDomain) preconnect(`https://${authDomain}`);

  // Where the user actually picks their account. One step later than the
  // handler above, and reached as a top-level document in the popup.
  prefetchDNS("https://accounts.google.com");

  // Refreshes the ID token once the session exists. Not on the critical path
  // for signing in, but on it for staying signed in.
  prefetchDNS("https://securetoken.googleapis.com");

  return null;
}
