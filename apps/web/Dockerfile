# Next.js standalone build. Build from the MONOREPO ROOT, not apps/web:
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_ROOT_DOMAIN=koraa.africa \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.koraa.africa/api/v1 \
#     ... -t koraa-web:latest .
#
# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so they
# are build args, not runtime env vars. Changing one means rebuilding the image.

# ── deps ──────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /repo
# The workspace root manifest and lockfile, plus the one workspace we build.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=apps/web --include-workspace-root

# ── builder ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY package.json package-lock.json ./
COPY apps/web ./apps/web

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ROOT_DOMAIN
ARG NEXT_PUBLIC_DASHBOARD_ORIGIN
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_ROOT_DOMAIN=$NEXT_PUBLIC_ROOT_DOMAIN \
    NEXT_PUBLIC_DASHBOARD_ORIGIN=$NEXT_PUBLIC_DASHBOARD_ORIGIN \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID \
    NEXT_TELEMETRY_DISABLED=1

# ROOT_DOMAIN drives the proxy's storefront-subdomain matching. If it is empty
# the built app treats every host as a custom domain and the marketing site is
# unreachable — fail the build instead of shipping that.
RUN test -n "$NEXT_PUBLIC_ROOT_DOMAIN" \
    || (echo "ERROR: --build-arg NEXT_PUBLIC_ROOT_DOMAIN is required" && exit 1)
RUN test -n "$NEXT_PUBLIC_API_URL" \
    || (echo "ERROR: --build-arg NEXT_PUBLIC_API_URL is required" && exit 1)

RUN npm run build --workspace=apps/web

# ── runner ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Redeclared: build args do not cross stage boundaries. Only used by the
# healthcheck below — the client bundle already has the value baked in.
ARG NEXT_PUBLIC_ROOT_DOMAIN

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_PUBLIC_ROOT_DOMAIN=$NEXT_PUBLIC_ROOT_DOMAIN

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# standalone bundles its own minimal node_modules; static/ and public/ are not
# included in it and must be copied alongside.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

# Host must be the root domain: the proxy treats an unrecognised host as a
# storefront slug, so a bare 127.0.0.1 probe would 404 on a missing store.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD node -e "const d=process.env.NEXT_PUBLIC_ROOT_DOMAIN||'localhost';require('http').get({host:'127.0.0.1',port:3000,path:'/',headers:{Host:d}},r=>process.exit(r.statusCode<400?0:1)).on('error',()=>process.exit(1))"

# outputFileTracingRoot is the monorepo root, so server.js lands under apps/web.
CMD ["node", "apps/web/server.js"]
