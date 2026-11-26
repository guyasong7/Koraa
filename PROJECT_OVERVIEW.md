# Koraa Project — Complete Overview

**Last Updated:** 2024-10-04  
**Status:** Production (deployed split architecture)

---

## Executive Summary

**Koraa** is a template-driven eCommerce storefront SaaS platform built for African businesses, with an initial focus on Cameroon. Merchants create professional online stores without code, choose from designed templates, customize branding, manage products, and sell through mobile money checkout.

The platform is currently **live in production** with a split deployment architecture:
- **Frontend:** Vercel (`koraa.cm`, `www.koraa.cm`, `*.koraa.cm` storefronts)
- **Backend API:** AWS EC2 (deployed manually via SSM)

---

## Architecture

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | Next.js (App Router) | 16.3.0 |
| **State Management** | Zustand, TanStack Query | 5.0.14, 5.101.4 |
| **Backend** | Django + Django REST Framework | 5.0.6, 3.15.2 |
| **Database** | PostgreSQL | 16 |
| **Cache/Queue** | Redis + Celery | 7 / 5.4.0 |
| **Authentication** | JWT (SimpleJWT) + Firebase (social login) | 5.3.1 |
| **API Docs** | drf-spectacular (Swagger/ReDoc) | 0.27.2 |
| **Storage** | Local (dev) / Cloudflare R2 (prod) | — |
| **Email** | Console (dev) / Resend (prod) | — |
| **Payments** | Fapshi (MTN MoMo, Orange Money) | — |

### Monorepo Structure

```
koraa/
├── apps/
│   └── web/              # Next.js 16 — Unified app (landing + dashboard + storefronts)
│       ├── src/
│       │   ├── app/
│       │   │   ├── (landing)/          # Marketing pages
│       │   │   ├── auth/               # Login, register, password reset
│       │   │   ├── dashboard/          # Merchant dashboard
│       │   │   └── store/[domain]/     # Public storefronts (multi-tenant)
│       │   ├── components/
│       │   │   ├── dashboard/          # Dashboard UI components
│       │   │   ├── storefront/         # Storefront UI components
│       │   │   └── ui/                 # Shared primitives (shadcn-style)
│       │   ├── stores/                 # Zustand stores (auth, cart, notifications)
│       │   ├── lib/                    # API client, utilities
│       │   └── types/                  # TypeScript types
│       └── package.json
│
├── backend/              # Django 5 + DRF
│   ├── apps/
│   │   ├── accounts/     # Custom User model, OTP, password reset
│   │   ├── merchants/    # Merchant profiles, plans, verification
│   │   ├── stores/       # Store model (tenant isolation)
│   │   ├── themes/       # Storefront themes/templates
│   │   ├── products/     # Products, variants, images, files, options
│   │   ├── categories/   # Product categories (hierarchical)
│   │   ├── orders/       # Orders, OrderItems, DownloadGrants
│   │   ├── payments/     # Subscriptions, PaymentTransactions, Fapshi integration
│   │   ├── storefront/   # Storefront customization (config, sections, service forms)
│   │   ├── notifications/# In-app notifications
│   │   ├── analytics/    # Storefront events (page views, engagement)
│   │   └── domains/      # Custom domain management
│   ├── config/
│   │   ├── settings/     # Django settings (base, development, production, test)
│   │   ├── urls.py       # Root URL configuration
│   │   ├── celery.py     # Celery configuration
│   │   └── storages.py   # Storage backends (local/R2)
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── requirements-imaging.txt  # Optional: rembg for background removal
│   └── manage.py
│
├── infrastructure/
│   ├── docker/
│   │   ├── docker-compose.yml          # Local dev stack
│   │   ├── docker-compose.prod.yml     # Full-stack production (unused in current deploy)
│   │   ├── docker-compose.ec2.yml      # EC2 backend-only stack (ACTIVE)
│   │   └── init-letsencrypt.sh         # TLS certificate bootstrap
│   ├── nginx/
│   │   ├── koraa.conf                  # Full-stack nginx config
│   │   ├── koraa-api.conf              # API-only config (ACTIVE on EC2)
│   │   └── snippets/                   # Reusable nginx blocks
│   └── aws/                            # AWS setup scripts
│
├── docs/
│   └── DEPLOYMENT.md     # Production deployment runbook
│
├── e-reseller/           # Separate PHP project (Camoo hosting reseller site)
├── package.json          # Monorepo root (Turborepo)
├── turbo.json            # Turborepo configuration
└── README.md
```

---

## Core Features

### Phase 1: Complete ✅
- **Infrastructure:** Docker Compose, nginx with TLS, Postgres, Redis, Celery
- **Authentication:** Email/password + Google OAuth, JWT tokens, OTP email verification
- **Merchant Management:** Onboarding, business profiles, subscription tiers (Free/Starter/Pro/Enterprise)
- **Store Management:** Create stores, subdomain allocation (`slug.koraa.cm`), store settings
- **Product Management:** Products (simple/variable/digital/service), variants, categories, images, downloadable files
- **Orders:** Checkout flow, Fapshi integration (MTN MoMo, Orange Money), order management
- **Payments:** Subscription purchases, payment webhooks, settlement, merchant payouts
- **Storefront:** Multi-tenant storefronts, customizable layouts, service enquiry forms
- **Analytics:** Traffic, engagement, sales tracking
- **Notifications:** In-app notifications, transactional emails (Resend)
- **Identity Verification:** Didit API integration for merchant KYC
- **Discount Codes:** Percentage and fixed-amount discounts

### Phase 2: In Progress 🔨
- **Variants & Inventory:** Product variant management, stock tracking
- **Customers:** Customer profiles, order history
- **Digital Delivery:** Download grants with limits and expiry

### Planned Features ⏳
- **Storefront Engine:** Template system, live preview, section reordering
- **Payments:** Stripe integration
- **WhatsApp Integration:** Order notifications, customer support
- **Custom Domains:** Full custom domain support with SSL
- **AI Store Assistant:** Product descriptions, SEO optimization

---

## Data Models (Key Entities)

### Core Tenant Hierarchy
```
User (accounts.User)
  └─ Merchant (merchants.Merchant)
       ├─ MerchantIdentity (KYC verification)
       ├─ MerchantStaff (team members per store)
       └─ Store (stores.Store)
            ├─ StorefrontConfig (storefront.StorefrontConfig)
            ├─ StorefrontSection (storefront.StorefrontSection)
            ├─ Product (products.Product)
            │    ├─ ProductImage
            │    ├─ ProductFile (digital products)
            │    ├─ ProductVariant
            │    ├─ ProductOption
            │    └─ ProductOptionValue
            ├─ Category (categories.Category)
            ├─ Order (orders.Order)
            │    ├─ OrderItem
            │    └─ DownloadGrant (digital delivery)
            └─ Event (analytics.Event)
```

### Subscription & Payments
```
Subscription (payments.Subscription)
  └─ PaymentTransaction (payments.PaymentTransaction)
```

---

## API Architecture

### Backend Endpoints

**Base URL:** `https://api.koraa.cm/api/v1/` (production)

#### Authentication (`/auth/`)
- `POST /register/` — Create account (returns JWT + sends OTP)
- `POST /login/` — Email + password → JWT tokens
- `POST /social/` — Google OAuth → JWT tokens
- `POST /logout/` — Blacklist refresh token
- `POST /token/refresh/` — Rotate access token
- `POST /verify-email/request/` — Send new OTP
- `POST /verify-email/confirm/` — Verify OTP
- `POST /password-reset/request/` — Send reset email
- `POST /password-reset/confirm/` — Reset password
- `POST /change-password/` — Change password (auth required)
- `GET/PATCH /me/` — User profile

#### Merchants (`/merchants/`)
- `POST /onboard/` — Create merchant profile
- `GET/PATCH /me/` — Merchant profile
- `GET /stats/` — Dashboard statistics
- `GET/PATCH /identity/` — KYC documents
- `POST /identity/verify/` — Start Didit verification
- `POST /phone/send-otp/` — Send phone verification OTP
- `POST /phone/verify-otp/` — Verify phone OTP
- `GET /payouts/` — List payout accounts
- `POST /payouts/` — Add payout account

#### Stores (`/stores/`)
- `GET/POST /` — List/create stores
- `GET /check-slug/?slug=name` — Check slug availability
- `GET/PATCH/DELETE /{id}/` — Store CRUD
- `POST /{id}/publish/` — Publish store
- `POST /{id}/unpublish/` — Take store offline

#### Products (`/stores/{store_id}/products/`)
- `GET/POST /` — List/create products
- `GET/PATCH/DELETE /{id}/` — Product CRUD
- Supports: simple, variable, digital, and service products

#### Categories (`/stores/{store_id}/categories/`)
- `GET/POST /` — List/create categories
- `GET/PATCH/DELETE /{id}/` — Category CRUD

#### Orders (`/orders/`)
- `GET /` — List merchant orders (filterable by store)
- `GET /{id}/` — Order details

#### Storefront (`/storefront/`)
- `GET/PATCH /config/` — Storefront configuration
- `GET/POST /sections/` — Section management
- `POST /sections/reorder/` — Reorder sections
- `POST /publish/` — Publish storefront changes

#### Public APIs (`/public/`)
- `GET /stores/{slug}/` — Store details by slug
- `GET /stores/{slug}/products/` — Public product list
- `GET /storefront/by-domain/?domain={domain}` — Store by custom domain
- `GET /storefront/{store_id}/config/` — Published storefront config
- `POST /orders/` — Create order (checkout)
- `POST /analytics/collect/` — Track storefront events

#### Payments (`/payments/`)
- `GET /plans/` — List subscription plans
- `POST /initiate/` — Initiate subscription payment
- `POST /webhook/` — Fapshi webhook handler
- `GET /subscriptions/` — User subscriptions
- `GET /transactions/` — Payment transaction history

#### Notifications (`/notifications/`)
- `GET /` — List user notifications
- `POST /{id}/read/` — Mark as read
- `POST /mark-all-read/` — Mark all as read

---

## Subscription Plans

Defined in `backend/apps/merchants/plans.py`:

| Tier | Monthly | Yearly | Stores | Products | Staff | Templates | Features |
|------|---------|--------|--------|----------|-------|-----------|----------|
| **Free** | 0 XAF | 0 XAF | 1 | 50 | 1 | 2 | Custom domain, MoMo checkout |
| **Starter** | 5,000 XAF | 50,000 XAF | 3 | 500 | 3 | 4 | + All Free features |
| **Pro** | 15,000 XAF | 150,000 XAF | ∞ | ∞ | 10 | ∞ | + Priority support |
| **Enterprise** | 35,000 XAF | 350,000 XAF | ∞ | ∞ | ∞ | ∞ | + Named contact, migration |

**Billing:** Yearly = 10x monthly (2 months free discount)

---

## Frontend Architecture

### Next.js App Structure

**Single unified Next.js app** serving:
1. **Landing pages** (`(landing)` route group): Marketing site, pricing, showcase
2. **Dashboard** (`dashboard/`): Merchant control panel
3. **Storefronts** (`store/[domain]/`): Multi-tenant public shops

### Key Pages

#### Landing
- `/` — Homepage
- `/pricing` — Plan comparison
- `/showcase` — Featured stores
- `/domains` — Custom domain info
- `/terms`, `/privacy` — Legal pages

#### Authentication
- `/auth/login` — Email/password + Google OAuth
- `/auth/register` — Account creation
- `/auth/onboarding` — Post-registration merchant setup
- `/auth/forgot-password`, `/auth/reset-password`

#### Dashboard
- `/dashboard` — Overview (sales, orders, analytics)
- `/dashboard/stores` — Store list
- `/dashboard/products` — Product management
- `/dashboard/orders` — Order book
- `/dashboard/customers` — Customer list
- `/dashboard/analytics` — Traffic & engagement
- `/dashboard/billing` — Plan & payment history
- `/dashboard/settings` — Account & store settings
- `/dashboard/settings/storefront` — Storefront customizer

#### Storefront (multi-tenant)
- `/store/[domain]` — Store homepage
- `/store/[domain]/shop` — Product catalog
- `/store/[domain]/product/[slug]` — Product detail
- `/store/[domain]/checkout` — Checkout flow
- `/store/[domain]/about` — About page
- `/store/[domain]/contact` — Contact/enquiry form

### State Management

**Zustand stores:**
- `stores/auth.ts` — Authentication state (tokens, user, merchant)
- `stores/cart.ts` — Shopping cart (per-store isolation)
- `stores/notifications.ts` — In-app notifications

**TanStack Query:** Server state caching for API calls

### Environment Variables (Browser)

Prefixed `KORAA_PUBLIC_*` (inlined at build time):
- `KORAA_PUBLIC_API_URL` — API base URL
- `KORAA_PUBLIC_ROOT_DOMAIN` — Root domain for subdomain routing
- `KORAA_PUBLIC_DASHBOARD_ORIGIN` — Dashboard origin for iframe postMessage
- `KORAA_PUBLIC_FIREBASE_*` — Firebase config (7 variables)

**Build-time validation:** `next.config.ts` checks required variables are set for production builds

---

## Deployment Architecture

### Current Production Setup (Split)

**Frontend (Vercel):**
- **Project:** `koraa-web`
- **Domains:** `koraa.cm`, `www.koraa.cm`, `*.koraa.cm` (wildcard storefronts)
- **DNS:** Nameservers on Vercel (critical: wildcard cert issued 2026-09-04)
- **Config:** 10 `KORAA_PUBLIC_*` environment variables set in Vercel dashboard
- **Notes:** Variables are dashboard-only; blank config still deploys with "READY" status

**Backend (AWS EC2):**
- **Stack:** `infrastructure/docker/docker-compose.ec2.yml`
- **Services:** Postgres, Redis, Django (gunicorn), Celery worker, Celery beat
- **Deployment:** Manual via SSM (no CI/CD)
- **Branch:** `feat/direct-pay-plans` (live production branch)
- **Git:** Requires `sudo -u ubuntu` for git operations on host
- **Domain:** `api.koraa.cm`
- **TLS:** Let's Encrypt via `infrastructure/aws/setup-letsencrypt.sh`
- **Nginx:** `infrastructure/nginx/koraa-api.conf`

### DNS Configuration (Current)

| Type | Name | Target | Purpose |
|------|------|--------|---------|
| `NS` | `koraa.cm` | Vercel nameservers | Root domain + wildcard storefronts |
| `A` | `api.koraa.cm` | EC2 IP | Backend API |

**Critical Note:** `*.koraa.cm` wildcard cert was issued on 2026-09-04 by retrying after moving nameservers to Vercel. Stale registrar NS records still cause NXDOMAIN errors for storefronts and risk renewal failure around 2026-12-03.

### Alternative: Full-Stack Docker (Not Active)

The repo includes `docker-compose.prod.yml` for a single-host deployment (frontend + backend + nginx + certbot), but **this is not how production currently runs**. See `docs/DEPLOYMENT.md` for the full-stack runbook.

---

## Payment Flow (Fapshi)

### Subscription Purchase
1. User selects plan on `/dashboard/billing`
2. Frontend calls `POST /api/v1/payments/initiate/`
3. Backend creates `PaymentTransaction`, calls Fapshi API
4. Fapshi returns payment link (hosted page)
5. User completes payment on Fapshi's page
6. Webhook hits `POST /api/v1/payments/webhook/`
7. Backend settles transaction (extend subscription, referral bonus)
8. Idempotency via `settled_at` timestamp (prevents double-activation)

### Order Checkout
1. Customer adds products to cart on storefront
2. Submits checkout form → `POST /api/v1/public/orders/`
3. Backend creates `Order`, calls Fapshi API
4. Customer completes payment
5. Webhook hits backend
6. Backend settles order (mark paid, payout merchant, mint download grants for digital products)
7. Idempotency via `settled_at` timestamp (prevents double-payout)

### Payout Flow
- **Trigger:** Order settlement for paid orders
- **Logic:** `apps/orders/settlement.py`
- **Model:** `Order.payout_status` tracks merchant payout state
- **Reference:** `Order.payout_reference` stores Fapshi transId
- **Error Handling:** `Order.payout_error` captures failure reasons

---

## AI Features

**Current Implementation:**
- **Provider:** OpenRouter (free tier)
- **Models:** Two model chains (details in memory: `koraa-ai-uses-free-openrouter-models.md`)
- **Limit:** 50 free requests/day account-wide
- **Known Issues:** Free models return 429/502 individually for hours
- **Planned Migration:** User wants all AI features migrated to dedicated endpoint (`claude-sonnet-4-6`) instead of OpenRouter free tier

**Usage:**
- Product description generation
- SEO metadata generation
- Other AI-assisted content creation

**Configuration:** See memory file `koraa-ai-api-config.md`

---

## Testing

### Backend Tests
- **Framework:** pytest + pytest-django
- **Factories:** factory-boy + faker
- **Coverage:** Unit tests in `backend/apps/*/tests/`
- **Run:** `cd backend && .venv/bin/pytest -v`

### Test Apps Present
- `apps/accounts/tests`
- `apps/merchants/tests`
- `apps/stores/tests`
- `apps/payments/tests`
- `apps/storefront/tests`

---

## Development Workflow

### Local Setup

**Backend:**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env  # Edit DATABASE_URL, REDIS_URL, etc.
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

**Frontend:**
```bash
npm install
npm run web:dev  # Starts Next.js on port 3000
```

**Docker (full stack):**
```bash
cd infrastructure/docker
docker compose up -d
```

### Environment Files
- `.env.local` — Local development variables (gitignored)
- `backend/.env` — Django local settings (gitignored)
- `.env.prod` — Production compose vars (gitignored)
- `backend/.env.prod` — Django production settings (gitignored)
- `*.example` versions are committed as templates

### Git Workflow
- **Main branch:** `main` (protected)
- **Active feature branches:**
  - `feat/direct-pay-plans` (DEPLOYED TO PRODUCTION EC2)
  - `develop`
  - `staging`

---

## Code Statistics

- **Backend Python files:** 207 files
- **Frontend TypeScript/TSX:** ~30,699 lines of code
- **Frontend components:** 40+ components
- **Backend serializers:** 9 files
- **Django apps:** 13 apps

---

## Key Configuration Files

### Backend
- `backend/config/settings/base.py` — Core Django settings
- `backend/config/settings/production.py` — Production overrides
- `backend/config/urls.py` — URL routing
- `backend/requirements.txt` — Python dependencies

### Frontend
- `apps/web/next.config.ts` — Next.js configuration with public env validation
- `apps/web/src/middleware.ts` — Subdomain routing logic
- `apps/web/package.json` — Frontend dependencies
- `apps/web/src/lib/api.ts` — Axios API client with JWT refresh

### Infrastructure
- `infrastructure/docker/docker-compose.ec2.yml` — ACTIVE backend stack
- `infrastructure/nginx/koraa-api.conf` — ACTIVE nginx config
- `infrastructure/docker/init-letsencrypt.sh` — TLS bootstrap script
- `turbo.json` — Turborepo task configuration

---

## Known Issues & Technical Debt

### Critical
1. **DNS Split:** `koraa.cm` NS on Vercel, but stale registrar NS causes NXDOMAIN for storefronts
2. **Manual Deployment:** Backend deploys manually via SSM; no CI/CD pipeline
3. **Git Access:** EC2 git operations require `sudo -u ubuntu`
4. **Public Config:** 10 `KORAA_PUBLIC_*` values only in Vercel dashboard; blank config still builds

### High Priority
1. **AI Model Limitations:** OpenRouter free tier hits 50 req/day limit, 429/502 errors
2. **Environment Variable Management:** Split between Vercel dashboard and EC2 host
3. **Certificate Renewal Risk:** Wildcard cert issued by workaround; renewal may fail

### Medium Priority
1. **Monorepo Complexity:** Single web app serves 3 distinct use cases (landing, dashboard, storefront)
2. **Test Coverage:** Limited integration/E2E tests
3. **Image Optimization:** Optional rembg feature (~200MB) not installed in production

---

## Recent Changes (Last 20 Commits)

```
7be291c style(web): restyle storefront checkout to match My Cart reference design
3111ec5 fix(web): fix TS error in paginated discount list extraction
3302d02 fix(web): extract results from paginated discount list response
d23ae7b fix(web): send 0 instead of null for optional discount fields
4b0ae5b fix(backend): add unthrottled /api/health/ endpoint for Docker healthcheck
e17d564 fix(web): stop showing Checkout is closed on transient API errors
2d24771 feat: switch checkout to Fapshi hosted payment page
cfaee4c feat: add discount codes — buyer checkout input and merchant dashboard
9550be7 fix(web): align customers page with dashboard design patterns
c435ba3 refactor(web): migrate icons from react-icons to @hugeicons/react
33f13ee refactor(web): move toasts from react-hot-toast to sonner
5185956 feat(web): add Tailwind token bridge and shadcn-pattern primitives
e859efc chore: point the web app at api.koraa.cm
e1cfb81 fix: move password reset onto the Django endpoint and break the fallback loop
a7d6e43 fix: recover Didit identity data when the webhook is missed
d32a8bc feat: notify merchants when a store is created
eb5c095 feat: rebuild transactional emails around a hosted logo
ee1b52e fix: add CORS headers on nginx error pages and allow Vercel preview origins
fa8c15c fix: surface email delivery errors instead of silently swallowing them
02f4eef fix: improve payment error handling and split notification email sender
```

---

## External Integrations

### Payment Processing
- **Fapshi:** MTN Mobile Money, Orange Money (Cameroon)
- **Webhooks:** Payment confirmation, order settlement

### Identity Verification
- **Didit API:** KYC verification for merchants
- **Flow:** Session-based verification with webhook callback

### Authentication
- **Firebase:** Google OAuth social login
- **Backend:** JWT token generation + Firebase token verification

### Email Delivery
- **Resend:** Transactional emails (verification, password reset, notifications)

### Storage
- **Cloudflare R2:** S3-compatible object storage for media (production)
- **Local filesystem:** Development media storage

### Analytics
- **Vercel Analytics:** Frontend performance monitoring
- **Custom Events:** In-app analytics via `apps.analytics.Event` model

---

## Security Considerations

### Authentication
- **Password Hashing:** Argon2 (via Django settings)
- **JWT Tokens:** Access (60min), Refresh (30 days) with rotation + blacklisting
- **OTP Storage:** SHA-256 hashed

### Data Protection
- **UUIDs:** All primary keys (prevents enumeration attacks)
- **Tenant Isolation:** All queries filtered by Store/Merchant
- **CORS:** Configured per environment
- **HTTPS:** Enforced in production (nginx + Let's Encrypt)

### Payment Security
- **Idempotency:** `settled_at` timestamps prevent double-processing
- **Webhook Validation:** (Implementation details in `apps/payments/views.py`)
- **PCI Compliance:** Payments handled by Fapshi (hosted page)

### Privacy
- **Analytics:** No persistent user tracking; visitor hash rotates daily
- **GDPR-Ready:** No IP storage in analytics events

---

## Future Roadmap

### Near-Term (Next 3-6 months)
1. Migrate AI features to dedicated Claude endpoint
2. Implement CI/CD pipeline for backend
3. Fix DNS split-brain issue
4. Add Stripe payment integration
5. Build storefront live preview with postMessage

### Medium-Term (6-12 months)
1. WhatsApp integration for order notifications
2. Advanced analytics dashboard
3. Mobile app (React Native/Flutter)
4. Multi-language support (French)
5. Inventory management refinements

### Long-Term (12+ months)
1. AI store assistant (conversational)
2. Marketplace features
3. Multi-currency support
4. Advanced SEO tools
5. Affiliate program

---

## Support & Documentation

- **API Docs:** `https://api.koraa.cm/api/docs/` (Swagger UI)
- **Deployment Guide:** `docs/DEPLOYMENT.md`
- **Customization Plan:** `storefront_customization_plan.md`
- **Django Admin:** `https://api.koraa.cm/admin/`

---

## Project Metadata

- **Repository:** Private (GitHub)
- **License:** Proprietary
- **Team Size:** Small team (based on commit history)
- **Language:** Python (backend), TypeScript (frontend)
- **Package Manager:** npm (frontend), pip (backend)
- **Monorepo Tool:** Turborepo
- **Target Market:** Cameroon 🇨🇲 (expanding to Africa)

---

## Contact & Deployment Access

- **Git User:** Guy Asong
- **Frontend Deploy:** Vercel project `koraa-web`
- **Backend Deploy:** AWS EC2 via SSM (manual)
- **Live Branch:** `feat/direct-pay-plans` (backend)
- **Domain:** `koraa.cm` (Vercel NS), `api.koraa.cm` (EC2)

---

**End of Overview**
