import type { NextConfig } from "next";
import path from "path";

const MONOREPO_ROOT = path.resolve(__dirname, "../../");

// Vercel sets VERCEL=1 during its build. On Vercel, standalone output is not
// needed — Vercel uses its own serverless function tracing mechanism, and
// forcing standalone here breaks the build pipeline.
const isVercel = !!process.env.VERCEL;

// ── Browser-visible configuration ────────────────────────────────────────────
//
// Every value the client needs is named KORAA_PUBLIC_*, not NEXT_PUBLIC_*.
//
// Next inlines NEXT_PUBLIC_* by itself and nothing else, so a different prefix
// only reaches the browser if it is declared here: anything listed in `env` is
// written into the client bundle regardless of what it is called. See
// node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/env.md
// — "prefixing the environment variable name with NEXT_PUBLIC_ only has an
// effect when specifying them through the environment or .env files".
//
// Each key falls back to the NEXT_PUBLIC_ name it replaced. That is what keeps
// the Docker path working with no changes: apps/web/Dockerfile and
// docker-compose.prod.yml still pass the old names as build args, and any host
// that already has the old variables set needs nothing done to it. Set the new
// name to override, and drop the old one whenever convenient.
//
// An unset variable resolves to "" instead of being left out, so every key is a
// real string in the bundle and `process.env.KORAA_PUBLIC_*` is never an
// un-inlined lookup that a bundler could leave to fail at runtime. The cost is
// that read sites must default with `||` and not `??` — "" is not nullish.
const PUBLIC_ENV_LEGACY_NAMES: Record<string, string> = {
  KORAA_PUBLIC_API_URL: "NEXT_PUBLIC_API_URL",
  KORAA_PUBLIC_ROOT_DOMAIN: "NEXT_PUBLIC_ROOT_DOMAIN",
  KORAA_PUBLIC_DASHBOARD_ORIGIN: "NEXT_PUBLIC_DASHBOARD_ORIGIN",
  KORAA_PUBLIC_SITE_URL: "NEXT_PUBLIC_KORAA_URL",
  KORAA_PUBLIC_FIREBASE_API_KEY: "NEXT_PUBLIC_FIREBASE_API_KEY",
  KORAA_PUBLIC_FIREBASE_AUTH_DOMAIN: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  KORAA_PUBLIC_FIREBASE_PROJECT_ID: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  KORAA_PUBLIC_FIREBASE_STORAGE_BUCKET: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  KORAA_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  KORAA_PUBLIC_FIREBASE_APP_ID: "NEXT_PUBLIC_FIREBASE_APP_ID",
};

/**
 * Cleans a value as typed into a host's dashboard.
 *
 * A shell strips the quotes off `FOO="bar"`; a web form does not, so a value
 * pasted with its quotes still attached arrives with them, and a value pasted
 * with a trailing newline keeps that too. Either one is non-empty, so it passes
 * the required-variable check below and is inlined verbatim — which is how a
 * quoted Firebase key becomes `auth/invalid-api-key` at sign-in, an error that
 * describes the key as wrong rather than as wrongly quoted.
 */
function normalize(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  // [\s\S] rather than the `s` flag: tsconfig targets below es2018, where
  // dotAll is not available.
  const quoted = /^(["'])[\s\S]*\1$/.test(trimmed) && trimmed.length >= 2;
  return quoted ? trimmed.slice(1, -1).trim() : trimmed;
}

const publicEnv: Record<string, string> = Object.fromEntries(
  Object.entries(PUBLIC_ENV_LEGACY_NAMES).map(([name, legacyName]) => [
    name,
    // `||`, not `??`: a variable created-but-left-blank in a host's dashboard
    // arrives as "" rather than undefined, and that must still fall through to
    // the legacy name instead of resolving to a blank value.
    normalize(process.env[name]) || normalize(process.env[legacyName]) || "",
  ]),
);

// ── Checked at build time ────────────────────────────────────────────────────
//
// Every value above is inlined, so a build that runs without them does not fail
// on its own — it silently bakes in each read site's `||` fallback and ships.
// That is not a theoretical concern: it is exactly how a Vercel deploy came to
// serve `apiKey: ""` and an API base of `http://localhost:8000/api/v1`, which
// surfaced to users only as "Google login failed. Please try again." — the
// sign-in path reports a broken config and an unreachable backend through the
// same catch.
//
// This warns rather than throwing, and the reason is specific to what hosts do
// with a failed build. Vercel keeps the previous deployment serving, so throwing
// here does not trade a broken deploy for no deploy — it pins production to the
// last broken bundle and hides the fact that anything was pushed at all. That is
// how this check briefly made things worse than it found them: the commit that
// taught sign-in to say "not configured on this deployment" could not reach
// anyone, because this threw before it could be built.
//
// Warning ships the bundle that reports its own misconfiguration instead —
// lib/firebase.ts refuses to initialise a blank config and lib/socialAuthError.ts
// turns that into one honest sentence — while still naming the variables in the
// build log. Set KORAA_STRICT_PUBLIC_ENV=1 where a hard stop is the right call:
// a release job with nothing live to fall back to.
//
// The required set matches the `:?` build args in apps/web/Dockerfile, which
// already drew this line: STORAGE_BUCKET and MESSAGING_SENDER_ID are optional
// there because nothing signs in without them, and DASHBOARD_ORIGIN and
// SITE_URL have honest same-origin defaults.
const REQUIRED_PUBLIC_ENV = [
  "KORAA_PUBLIC_API_URL",
  "KORAA_PUBLIC_ROOT_DOMAIN",
  "KORAA_PUBLIC_FIREBASE_API_KEY",
  "KORAA_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "KORAA_PUBLIC_FIREBASE_PROJECT_ID",
  "KORAA_PUBLIC_FIREBASE_APP_ID",
] as const;

/** Escalates the report below from a warning to a build failure. */
const STRICT_PUBLIC_ENV = process.env.KORAA_STRICT_PUBLIC_ENV === "1";

/**
 * Reports a production build whose browser configuration cannot work.
 *
 * Guarded on the build phase, not on NODE_ENV: `next start` also runs with
 * NODE_ENV=production, and by then the values are already inlined into the
 * bundle — the environment it starts with says nothing about the build it is
 * serving, so complaining there would be about the wrong machine entirely.
 */
function checkPublicEnv(phase: string): void {
  if (phase !== "phase-production-build") return;

  const problems = [...missingPublicEnv(), ...unusablePublicEnv()];
  if (problems.length === 0) return;

  const report = [
    ``,
    `⚠ Browser configuration is incomplete for this production build:`,
    ``,
    ...problems,
    ``,
    `  These are inlined into the client bundle at build time, so the build`,
    `  below will ship fallback values and sign-in will not work in it.`,
    ``,
    `  Vercel: Project Settings -> Environment Variables, ticking Production`,
    `          and Preview, then redeploy. Values added there do not reach a`,
    `          build that has already run.`,
    `  Docker: pass them as --build-arg (see apps/web/Dockerfile).`,
    `  Local:  apps/web/.env.local — gitignored, so it never reaches a host.`,
    ``,
  ].join("\n");

  if (STRICT_PUBLIC_ENV) throw new Error(report);

  // Once per build, not once per process. Next loads this config again in each
  // worker it forks for page data and static generation, and a warning repeated
  // four times reads like four separate problems. Workers inherit the parent's
  // environment, so a marker set here is already present by the time they load
  // it. Deliberately not a module-scope boolean: each worker gets its own fresh
  // copy of this module, so a local flag would never be the one already set.
  if (process.env.__KORAA_PUBLIC_ENV_REPORTED === "1") return;
  process.env.__KORAA_PUBLIC_ENV_REPORTED = "1";
  console.warn(report);
}

/** The required values this build has nothing at all for. */
function missingPublicEnv(): string[] {
  return REQUIRED_PUBLIC_ENV.filter((name) => !publicEnv[name]).map(
    (name) => `  - ${name} is not set (nor ${PUBLIC_ENV_LEGACY_NAMES[name]}).`,
  );
}

/**
 * The values that are present but cannot work, which the check above passes.
 *
 * Both cases here have been shipped to production and both reported themselves
 * as something else: a Firebase key that is not a key surfaces at sign-in only
 * as `auth/invalid-api-key`, and an API base pointing at localhost fails as a
 * dropped request from the visitor's own machine. Naming the variable at build
 * time is the difference between a one-line fix and reading bundle output.
 *
 * Each check requires its value to be non-empty, so a variable that is simply
 * missing is reported once by `missingPublicEnv` rather than twice.
 */
function unusablePublicEnv(): string[] {
  const problems: string[] = [];

  // Google API keys are `AIza` + 35 characters. Checking only the prefix keeps
  // this from going stale if the length ever changes, and still catches a
  // truncated paste, a project id pasted into the wrong field, or a value that
  // is still URL-encoded.
  const apiKey = publicEnv.KORAA_PUBLIC_FIREBASE_API_KEY;
  if (apiKey && !apiKey.startsWith("AIza")) {
    problems.push(
      `  - KORAA_PUBLIC_FIREBASE_API_KEY does not look like a Google API key.\n` +
        `    Expected it to begin with "AIza"; got ${JSON.stringify(
          apiKey.length > 12 ? `${apiKey.slice(0, 12)}…` : apiKey,
        )}.\n` +
        `    Firebase Console -> Project settings -> Your apps -> SDK setup.`,
    );
  }

  // A browser-facing base URL on localhost means the visitor's own machine, so
  // it can only ever work for a build someone runs and opens themselves. That
  // is a real case — `next build && next start` locally — so this only reports
  // where the build is demonstrably for a deployment.
  const isDeployBuild = !!process.env.VERCEL || !!process.env.CI;
  const apiUrl = publicEnv.KORAA_PUBLIC_API_URL;
  if (isDeployBuild && /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(apiUrl)) {
    problems.push(
      `  - KORAA_PUBLIC_API_URL points at localhost (${apiUrl}) in a deployed build.\n` +
        `    That resolves to each visitor's own machine, not the API. Use the\n` +
        `    public origin, e.g. https://<api host>/api/v1.`,
    );
  }

  // An https page cannot call an http API — the browser blocks it as mixed
  // content before any request is made, and the failure looks like the network
  // dropped rather than like a scheme mismatch.
  if (isDeployBuild && apiUrl.startsWith("http://")) {
    problems.push(
      `  - KORAA_PUBLIC_API_URL is http:// in a deployed build (${apiUrl}).\n` +
        `    Pages are served over https, and browsers block mixed content, so\n` +
        `    every API call would fail. Use https://, or a relative /api/v1 if a\n` +
        `    proxy serves the API from the page's own origin.`,
    );
  }

  return problems;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: publicEnv,
  turbopack: {
    root: MONOREPO_ROOT,
  },
  // Dev runs on webpack (`next dev --webpack`), not Turbopack, and polls instead
  // of using inotify. Turbopack is rooted at the monorepo above, so its watcher
  // tries to cover every hoisted dependency under the root node_modules — more
  // directories than fs.inotify.max_user_watches (65536 here) has room for once
  // an editor is watching the same tree. When registration fails Turbopack
  // cannot read the file either, so PostCSS's own dependencies fail to load and
  // every CSS entry point 500s with "Could not parse module
  // '.../picocolors/picocolors.js'" — an error that names CSS but is really an
  // exhausted OS limit.
  //
  // pollIntervalMs does NOT fix that: Turbopack's native watcher ignores it for
  // reads. It IS wired to webpack's watchOptions.poll, which drops inotify
  // entirely. Hence the --webpack dev script. Raise the sysctl and `npm run
  // dev:turbo` gets Turbopack's speed back. Build is unaffected: it never watches.
  watchOptions: {
    pollIntervalMs: 1000,
  },
  // Emits .next/standalone with only the traced runtime dependencies, so the
  // Docker container does not need node_modules or the full monorepo around it.
  // Disabled on Vercel, which manages its own output tracing for serverless fns.
  output: isVercel ? undefined : "standalone",
  // Traced from the monorepo root so hoisted workspace dependencies are
  // included in the standalone bundle. Only needed for Docker deploys.
  outputFileTracingRoot: isVercel ? undefined : MONOREPO_ROOT,
  // The proxy rewrites storefront hosts onto /store/<slug>; nothing in the app
  // reflects the Host header into a response, and nginx sets it explicitly.
  poweredByHeader: false,
  images: {
    // Required from Next 16 — the default narrowed to [75] so that an
    // arbitrary ?q= cannot be used to make the optimizer do unbounded work.
    // 75 for photographs, 90 for the hero strip: those eight images are the
    // first thing anyone sees and 4:5 crops of market stalls show ringing
    // around the stall edges at 75.
    qualities: [75, 90],
    // AVIF first. It is roughly 20-30% smaller than WebP on these photographs
    // and every browser that matters in Cameroon has had it since 2021;
    // anything older falls through to WebP, then to the original JPEG.
    formats: ["image/avif", "image/webp"],
    // Next 16 raised the default from 60s to 4h. Left explicit and longer:
    // every image under public/ is part of a deploy, so the only thing that
    // changes one is a new build, and a new build changes its URL.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  // NOTE on experimental.inlineCss: tried and reverted, deliberately. It does
  // remove the two render-blocking stylesheet requests, but this app's CSS is
  // 82KB uncompressed and Next inlines it *twice* — once in <head> and again
  // verbatim inside the RSC flight payload that follows the markup. Measured:
  // the landing HTML went 103KB -> 336KB, FCP 1.1s -> 2.1s and Speed Index
  // 2.2s -> 5.0s, for a Lighthouse score of 70 against 83 without it. It is
  // worth revisiting only if the CSS gets much smaller, or once the flight
  // payload stops carrying its own copy.
};

// Function form so the build phase is available — see `checkPublicEnv`. The
// config itself is identical in every phase.
export default (phase: string): NextConfig => {
  checkPublicEnv(phase);
  return nextConfig;
};
