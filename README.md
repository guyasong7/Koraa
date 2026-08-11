# Koraa

> **Launch your online store. Own your brand. Sell everywhere.**

Koraa is a template-driven ecommerce storefront SaaS for African businesses. Merchants create professional online stores without writing code, choosing from professionally designed templates and customizing their branding, products, and checkout.

---

## Architecture

```
koraa/
├── apps/
│   ├── dashboard/      # Next.js 16 — Merchant Dashboard (port 3000)
│   ├── storefront/     # Next.js 16 — Public Storefront (port 3001)
│   └── landing/        # Next.js 16 — Marketing site (port 3002)
├── backend/            # Django 5 + DRF — REST API (port 8000)
├── infrastructure/
│   └── docker/         # Docker Compose for local dev
└── packages/           # Shared UI components, types (Phase 2+)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, TypeScript, Zustand, TanStack Query |
| Backend | Django 5, Django REST Framework, SimpleJWT |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 + Celery |
| Auth | JWT (access 60m, refresh 30d) + OTP email verification |
| API Docs | drf-spectacular (Swagger + ReDoc) |
| Storage | Local (dev) / Cloudflare R2 (prod) |
| Email | Console (dev) / Resend (prod) |

---

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16 running locally **or** Docker

### 1. Clone & enter

```bash
cd koraa
```

### 2. Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit DATABASE_URL if needed
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Backend runs at: **http://localhost:8000**
API docs: **http://localhost:8000/api/docs/**

### 3. Dashboard setup

```bash
# From monorepo root:
npm install
npm run dashboard:dev
```

Dashboard runs at: **http://localhost:3000**

### 4. Docker (full stack)

```bash
cd infrastructure/docker
cp ../../backend/.env.example .env
docker compose up -d
```

---

## API Endpoints (Phase 1)

### Auth — `/api/v1/auth/`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register/` | Create account (returns JWT + sends OTP) |
| POST | `/login/` | Email + password → JWT tokens |
| POST | `/logout/` | Blacklist refresh token |
| POST | `/token/refresh/` | Rotate access token |
| POST | `/verify-email/request/` | Send new OTP |
| POST | `/verify-email/confirm/` | Verify OTP |
| POST | `/password-reset/request/` | Send reset email |
| POST | `/password-reset/confirm/` | Reset password |
| POST | `/change-password/` | Change password (auth required) |
| GET/PATCH | `/me/` | Profile (auth required) |

### Merchants — `/api/v1/merchants/`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/onboard/` | Create merchant profile |
| GET/PATCH | `/me/` | Merchant profile |

### Stores — `/api/v1/stores/`

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/` | List / create stores |
| GET | `/check-slug/?slug=name` | Check slug availability |
| GET/PATCH/DELETE | `/{id}/` | Retrieve / update / suspend |
| POST | `/{id}/publish/` | Publish store |
| POST | `/{id}/unpublish/` | Take offline |

### Products — `/api/v1/stores/{store_id}/products/`

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/` | List / create products |
| GET/PATCH/DELETE | `/{id}/` | Detail / update / delete |

### Categories — `/api/v1/stores/{store_id}/categories/`

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/` | List / create categories |
| GET/PATCH/DELETE | `/{id}/` | Detail / update / delete |

---

## Phase Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **1** | Infra · Auth · Merchant · Store · Products · Categories | ✅ Complete |
| **2** | Variants · Inventory · Customers · Orders | 🔨 Next |
| **3** | Storefront Engine · Templates · Cart · Checkout | ⏳ Pending |
| **4** | Customizer · Live Preview · Publishing · Subdomains | ⏳ Pending |
| **5** | Payments (MTN MoMo, Orange Money, Stripe) | ⏳ Pending |
| **6** | WhatsApp Integration · Analytics · Custom Domains | ⏳ Pending |
| **7** | AI Store Assistant | ⏳ Pending |

---

## Running Tests

```bash
# Backend
cd backend
.venv/bin/pytest -v

# Or from root:
npm run backend:test
```

---

## Environment Variables

See [`backend/.env.example`](backend/.env.example) for all required variables.

Key variables:
- `SECRET_KEY` — Django secret (generate with `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`)
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `CORS_ALLOWED_ORIGINS` — Frontend URLs

---

## Admin

Django admin available at: **http://localhost:8000/admin/**

```bash
cd backend && .venv/bin/python manage.py createsuperuser
```

---

*Built for Africa — starting with Cameroon 🇨🇲*
