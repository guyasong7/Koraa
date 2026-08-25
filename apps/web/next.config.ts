import type { NextConfig } from "next";
import path from "path";

const MONOREPO_ROOT = path.resolve(__dirname, "../../");

// Vercel sets VERCEL=1 during its build. On Vercel, standalone output is not
// needed — Vercel uses its own serverless function tracing mechanism, and
// forcing standalone here breaks the build pipeline.
const isVercel = !!process.env.VERCEL;

const nextConfig: NextConfig = {
  reactStrictMode: true,
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

export default nextConfig;
