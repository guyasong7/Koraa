"""
Koraa — Django Settings
Twelve-Factor App compliant configuration via environment variables.
"""

import os
from pathlib import Path
from datetime import timedelta

import environ
from celery.schedules import crontab

# ──────────────────────────────────────────────────────────────────────────────
# Base directory
# ──────────────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / ".env")

# ──────────────────────────────────────────────────────────────────────────────
# Security
# ──────────────────────────────────────────────────────────────────────────────
SECRET_KEY = env("SECRET_KEY")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

# ──────────────────────────────────────────────────────────────────────────────
# Application definition
# ──────────────────────────────────────────────────────────────────────────────
DJANGO_APPS = [
    "jazzmin",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "django_celery_beat",
    "django_celery_results",
    "storages",
]

LOCAL_APPS = [
    "apps.accounts",
    "apps.merchants",
    "apps.stores",
    "apps.themes",
    "apps.products",
    "apps.categories",
    "apps.storefront",
    "apps.domains",
    "apps.payments",
    "apps.notifications",
    # Phase 2 — added as each app is built:
    # "apps.inventory",
    # "apps.customers",
    "apps.orders",
    "apps.analytics",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ──────────────────────────────────────────────────────────────────────────────
# Middleware
# ──────────────────────────────────────────────────────────────────────────────
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# ──────────────────────────────────────────────────────────────────────────────
# Database
# ──────────────────────────────────────────────────────────────────────────────
# env.db() auto-detects backend from URL scheme:
#   sqlite:///db.sqlite3  → django.db.backends.sqlite3  (local dev)
#   postgresql://...      → django.db.backends.postgresql (Docker/prod)
DATABASES = {
    "default": env.db("DATABASE_URL", default="sqlite:///db.sqlite3")
}
# Persistent connections (Postgres only — SQLite ignores this)
if not DATABASES["default"]["ENGINE"].endswith("sqlite3"):
    DATABASES["default"]["CONN_MAX_AGE"] = 60
    # psycopg3 URL scheme support
    environ.Env.DB_SCHEMES["postgresql+psycopg"] = "django.db.backends.postgresql"

# ──────────────────────────────────────────────────────────────────────────────
# Cache
# ──────────────────────────────────────────────────────────────────────────────
# Redis when it is there, in-memory when it is not, so `runserver` works on a
# laptop with nothing installed. The two are not equivalent and the difference
# matters in more than one place:
#
#   * DRF's throttles count in this cache. LocMem is per-process, so three
#     gunicorn workers turn "100/hour" into 300/hour and every deploy resets
#     the counters. `production.py` refuses to boot without REDIS_URL for
#     exactly this reason.
#   * Cached storefront payloads and Firebase certificates would be filled
#     three times over and evicted independently.
#
# KEY_PREFIX namespaces the keyspace so a staging and a production stack can
# share one Redis instance without reading each other's entries — and so a
# `FLUSHDB` is never the only way to clear one of them. TIMEOUT is the default
# for callers that pass none; every cache in this codebase passes its own.
_REDIS_URL = env("REDIS_URL", default="")
if _REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": _REDIS_URL,
            "KEY_PREFIX": env("CACHE_KEY_PREFIX", default="koraa"),
            "TIMEOUT": 300,
            "OPTIONS": {
                # A cache is not a database. If Redis is slow or gone, a request
                # must fail its cache lookup in milliseconds and carry on to the
                # real query, not hold a worker open waiting.
                "socket_connect_timeout": 2,
                "socket_timeout": 2,
            },
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "KEY_PREFIX": "koraa",
            "TIMEOUT": 300,
        }
    }

# ──────────────────────────────────────────────────────────────────────────────
# Custom User Model
# ──────────────────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = "accounts.User"

# ──────────────────────────────────────────────────────────────────────────────
# Password validation
# ──────────────────────────────────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

# ──────────────────────────────────────────────────────────────────────────────
# Internationalization
# ──────────────────────────────────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Douala"
USE_I18N = True
USE_TZ = True

# ──────────────────────────────────────────────────────────────────────────────
# Static & Media Files
# ──────────────────────────────────────────────────────────────────────────────
# Static files are always local, collected into STATIC_ROOT and served by
# whitenoise. Only media — merchant uploads: product images, store logos,
# digital-delivery files — is a candidate for object storage.
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Set even when media lives in a bucket. config/urls.py reads MEDIA_ROOT
# unconditionally under DEBUG to hand to django.conf.urls.static.static(), so
# leaving it unset made `runserver` with USE_S3 die on an AttributeError before
# serving a single request.
MEDIA_ROOT = BASE_DIR / "media"

USE_S3 = env.bool("USE_S3", default=False)

if USE_S3:
    AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME")
    AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", default="us-east-1")

    # Deliberately allowed to be absent. Unset, django-storages passes None to
    # boto3, which then resolves credentials from the EC2 instance metadata
    # service — so a host with an IAM role needs no long-lived key in its env
    # file at all. An empty string would instead be taken as a real (invalid)
    # key and every upload would fail on signature validation, hence the
    # `or None`.
    AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID", default="") or None
    AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY", default="") or None

    # Region-qualified host. The bare `<bucket>.s3.amazonaws.com` form only
    # resolves for us-east-1; every other region answers a 301 to the regional
    # endpoint, and a redirect without CORS headers reads in the browser as the
    # image having simply failed to load.
    AWS_S3_CUSTOM_DOMAIN = env(
        "AWS_S3_CUSTOM_DOMAIN",
        default=f"{AWS_STORAGE_BUCKET_NAME}.s3.{AWS_S3_REGION_NAME}.amazonaws.com",
    )

    # No ACL, rather than the "public-read" this used to send. Buckets created
    # since April 2023 have Object Ownership set to bucket-owner-enforced, which
    # disables ACLs outright — S3 then rejects any request carrying one with
    # AccessControlListNotSupported, so every upload would 400. Public read is
    # granted by a bucket policy on the media/ prefix instead.
    AWS_DEFAULT_ACL = None

    # Unsigned URLs: product images are public, and a signed URL would carry an
    # expiry into the storefront payloads cached in Redis, so images would start
    # 403ing partway through a cache entry's life.
    AWS_QUERYSTRING_AUTH = False
    AWS_S3_FILE_OVERWRITE = False
    AWS_S3_SIGNATURE_VERSION = "s3v4"
    AWS_S3_OBJECT_PARAMETERS = {"CacheControl": "max-age=86400"}

    # One prefix for everything, so the bucket policy can open up media/* and
    # nothing else.
    AWS_LOCATION = "media"
    MEDIA_URL = f"https://{AWS_S3_CUSTOM_DOMAIN}/{AWS_LOCATION}/"
else:
    MEDIA_URL = "/media/"

# STORAGES, not DEFAULT_FILE_STORAGE. Django 4.2 deprecated the latter and
# raises ImproperlyConfigured("DEFAULT_FILE_STORAGE/STORAGES are mutually
# exclusive") when both are set — and production.py sets STORAGES, so the
# DEFAULT_FILE_STORAGE that used to live here meant USE_S3=True could not boot
# at all. production.py overrides these two entries rather than replacing the
# dict, so the choice made here survives.
STORAGES = {
    "default": {
        "BACKEND": (
            "storages.backends.s3boto3.S3Boto3Storage"
            if USE_S3
            else "django.core.files.storage.FileSystemStorage"
        ),
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ──────────────────────────────────────────────────────────────────────────────
# DRF — Django REST Framework
# ──────────────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/hour",
        "user": "1000/hour",
        "auth": "10/minute",
        # A shopper's browser polls for up to three minutes while they approve a
        # mobile money charge on their handset — roughly two dozen calls. The
        # default `anon` scope is 100/hour counted per IP, which would cut off
        # the fourth shopper behind a mobile carrier's NAT halfway through
        # paying. Both scopes below are therefore deliberately generous; what
        # actually protects Fapshi is the per-transaction cache gate in
        # `StorefrontOrderStatusView`, not a request count.
        "order-status": "120/minute",
        # The dashboard's equivalent while a merchant approves a plan charge.
        # Authenticated, so this counts per user rather than per IP — merchants
        # behind one office NAT cannot exhaust each other's budget. The
        # per-transaction cache gate in `PaymentCallbackView` is what protects
        # Fapshi.
        "plan-status": "120/minute",
        # Starting a charge is the expensive one — it reaches Fapshi every time —
        # but a shopper legitimately retries after mistyping a number, and each
        # attempt is one call.
        "checkout-pay": "12/minute",
    },
}

# ──────────────────────────────────────────────────────────────────────────────
# JWT — SimpleJWT
# ──────────────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    # Matched to the dashboard's ten-minute idle rule (see
    # apps/web/src/components/SessionGuard.tsx) so a stolen access token cannot
    # outlive the UI that enforces it. Short only works because the refresh
    # below is long and rotation is honoured on the client: lib/api.ts persists
    # the rotated refresh token, without which BLACKLIST_AFTER_ROTATION would
    # eject an active user on their second refresh — around twenty minutes in.
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=10),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "TOKEN_OBTAIN_SERIALIZER": "apps.accounts.serializers.KoraaTokenObtainPairSerializer",
}

# ──────────────────────────────────────────────────────────────────────────────
# CORS
# ──────────────────────────────────────────────────────────────────────────────
# The apex domain the platform is served from. Storefronts live on subdomains of
# it, so it also drives the wildcard regex below.
KORAA_ROOT_DOMAIN = env("KORAA_ROOT_DOMAIN", default="koraa.cm")

CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        # The apex serves the landing page, auth and the dashboard. It does not
        # match the subdomain regex below, so it has to be listed explicitly —
        # without it every login from https://<root domain> is CORS-blocked.
        f"https://{KORAA_ROOT_DOMAIN}",
        f"https://www.{KORAA_ROOT_DOMAIN}",
    ],
)
# Storefronts are served from <slug>.<root domain>, one per merchant, so the
# origins cannot be enumerated ahead of time.
#
# Fully custom merchant domains (StoreDomain records) are NOT covered by these
# patterns. Add each verified custom domain to CORS_ALLOWED_ORIGINS, or point
# NEXT_PUBLIC_API_URL at the same-origin /api/v1 path that nginx proxies, which
# avoids cross-origin requests altogether.
_root_re = KORAA_ROOT_DOMAIN.replace(".", r"\.")
CORS_ALLOWED_ORIGIN_REGEXES = env.list(
    "CORS_ALLOWED_ORIGIN_REGEXES",
    default=[
        r"^http://[a-z0-9\-]+\.localhost:3000$",
        rf"^https://[a-z0-9\-]+\.{_root_re}$",
    ],
)
CORS_ALLOW_CREDENTIALS = True

# ──────────────────────────────────────────────────────────────────────────────
# drf-spectacular (API Docs)
# ──────────────────────────────────────────────────────────────────────────────
SPECTACULAR_SETTINGS = {
    "TITLE": "Koraa API",
    "DESCRIPTION": "Template-driven ecommerce storefront SaaS for African businesses.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_NAME_OVERRIDES": {
        "StoreStatusEnum": "apps.stores.models.Store.Status",
        "ProductStatusEnum": "apps.products.models.Product.Status",
        "ProductTypeEnum": "apps.products.models.Product.ProductType",
        "MerchantTierEnum": "apps.merchants.models.Merchant.SubscriptionTier",
    },
    "TAGS": [
        {"name": "auth", "description": "Authentication & token management"},
        {"name": "merchants", "description": "Merchant profile management"},
        {"name": "stores", "description": "Store management"},
        {"name": "products", "description": "Product catalogue"},
        {"name": "orders", "description": "Order management"},
    ],
}

# ──────────────────────────────────────────────────────────────────────────────
# Celery
# ──────────────────────────────────────────────────────────────────────────────
CELERY_BROKER_URL = env("REDIS_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = "django-db"
CELERY_CACHE_BACKEND = "django-cache"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"

#: Subscription lifecycle. DatabaseScheduler syncs these into the beat table
#: on startup, so they need no admin setup. Both sweeps are idempotent — see
#: ``apps.payments.lifecycle`` — and can also be run by hand with
#: ``manage.py sync_subscriptions``, which is how local development (no Redis)
#: exercises them.
CELERY_BEAT_SCHEDULE = {
    "warn-expiring-subscriptions": {
        "task": "payments.warn_expiring_subscriptions",
        # 07:10 daily. Off the hour so it does not queue behind every other
        # cron on the box.
        "schedule": crontab(hour=7, minute=10),
    },
    "expire-lapsed-subscriptions": {
        "task": "payments.expire_lapsed_subscriptions",
        "schedule": crontab(hour=7, minute=25),
    },
    #: Not an optimisation — the only backstop under the storefront. Fapshi
    #: delivers each webhook once and never retries, so a notification lost to a
    #: deploy or a restart means a buyer has paid and received nothing. Every 15
    #: minutes, offset off the quarter hour to stay clear of deploy windows.
    #:
    #: Idempotent (see ``apps.orders.settlement``) and it only ever *reads* from
    #: Fapshi to decide. Payout retries are deliberately absent: they move money
    #: and belong to ``manage.py reconcile_orders --retry-payouts``, run by a
    #: human.
    "reconcile-pending-orders": {
        "task": "orders.reconcile_pending",
        "schedule": crontab(minute="7,22,37,52"),
    },
    #: The same backstop for plan purchases, and needed for the same reason:
    #: direct-pay has no redirect, so a merchant who closes the tab before
    #: approving the prompt on their handset leaves nothing watching the payment.
    #: The webhook is single-delivery, so without this a merchant can be charged
    #: for a term and hold a PENDING subscription.
    #:
    #: Offset from the orders sweep rather than sharing its minute: both walk
    #: pending rows one Fapshi call at a time, and running them together doubles
    #: the burst against the gateway for no gain.
    "reconcile-pending-subscriptions": {
        "task": "payments.reconcile_pending",
        "schedule": crontab(minute="12,42"),
    },
}

# ──────────────────────────────────────────────────────────────────────────────
# Email
# ──────────────────────────────────────────────────────────────────────────────
EMAIL_BACKEND = env(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend",
)
EMAIL_HOST = env("EMAIL_HOST", default="")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Koraa <noreply@koraa.cm>")

# ──────────────────────────────────────────────────────────────────────────────
# Koraa Platform settings
# ──────────────────────────────────────────────────────────────────────────────
KORAA_STOREFRONT_DOMAIN = env("KORAA_STOREFRONT_DOMAIN", default="localhost:3000")
KORAA_DASHBOARD_URL = env("KORAA_DASHBOARD_URL", default="http://localhost:3000")
# Where this API answers from. Needed because MEDIA_URL is relative in
# development ("/media/…"), and an emailed invoice carrying the storefront's
# own logo has to point at something a mail client can fetch. In production
# media is on S3 and already absolute, so this is only consulted as a prefix
# for paths that are not.
KORAA_API_URL = env("KORAA_API_URL", default="http://localhost:8000")
KORAA_MAX_STORES_FREE = 5
KORAA_MAX_PRODUCTS_FREE = 50

# Share of each storefront order Koraa retains; the rest is paid out to the
# merchant. Expressed as a fraction, so 0.05 is 5%.
KORAA_PLATFORM_COMMISSION_RATE = env.float("KORAA_PLATFORM_COMMISSION_RATE", default=0.05)

# Firebase project whose ID tokens we accept. Must match the project the
# frontend's NEXT_PUBLIC_FIREBASE_PROJECT_ID points at, or every social login
# fails audience verification.
FIREBASE_PROJECT_ID = env("FIREBASE_PROJECT_ID", default="koraa-a3ecd")

# ──────────────────────────────────────────────────────────────────────────────
# Camoo SMS
# Used to send phone-verification OTPs to merchants during identity setup.
# Credentials from https://www.camoo.cm — API section of your account.
# ──────────────────────────────────────────────────────────────────────────────
CAMOO_API_KEY    = env("CAMOO_API_KEY",    default="")
CAMOO_API_SECRET = env("CAMOO_API_SECRET", default="")
# Alphanumeric sender ID shown to the recipient (max 11 chars).
CAMOO_SENDER_ID  = env("CAMOO_SENDER_ID",  default="Koraa")

# ──────────────────────────────────────────────────────────────────────────────
# Jazzmin Admin Theme
# ──────────────────────────────────────────────────────────────────────────────
JAZZMIN_SETTINGS = {
    "site_title": "Koraa Admin",
    "site_header": "Koraa",
    "site_brand": "Koraa Dashboard",
    "welcome_sign": "Welcome to the Koraa Administration",
    "copyright": "Koraa Ltd",
    "search_model": ["accounts.User", "products.Product"],
    "show_ui_builder": False,
    "topmenu_links": [
        {"name": "Home",  "url": "admin:index", "permissions": ["auth.view_user"]},
        {"name": "Storefront", "url": "/", "new_window": True},
    ],
    "icons": {
        "accounts.User": "fas fa-users",
        "stores.Store": "fas fa-store",
        "products.Product": "fas fa-box",
        "products.ProductCategory": "fas fa-tags",
        "merchants.Merchant": "fas fa-user-tie",
    },
    "default_icon_parents": "fas fa-chevron-circle-right",
    "default_icon_children": "fas fa-circle",
}

JAZZMIN_UI_TWEAKS = {
    "navbar_small_text": False,
    "footer_small_text": False,
    "body_small_text": False,
    "brand_small_text": False,
    "brand_colour": "navbar-purple",
    "accent": "accent-purple",
    "navbar": "navbar-purple navbar-dark",
    "no_navbar_border": False,
    "navbar_fixed": False,
    "layout_boxed": False,
    "footer_fixed": False,
    "sidebar_fixed": False,
    "sidebar": "sidebar-light-purple",
    "sidebar_nav_small_text": False,
    "sidebar_disable_expand": False,
    "sidebar_nav_child_indent": False,
    "sidebar_nav_compact_style": False,
    "sidebar_nav_legacy_style": False,
    "sidebar_nav_flat_style": False,
    "theme": "default",
    "dark_mode_theme": None,
    "button_classes": {
        "primary": "btn-outline-purple",
        "secondary": "btn-outline-secondary",
        "info": "btn-info",
        "warning": "btn-warning",
        "danger": "btn-danger",
        "success": "btn-success"
    }
}

# ──────────────────────────────────────────────────────────────────────────────
# Fapshi Payment Gateway
#
# Every value here is read at call time by apps/payments/fapshi.py, which is the
# only module that talks to Fapshi. Nothing below has a working default, and that
# is deliberate: FAPSHI_BASE_URL used to default to https://live.fapshi.com, so a
# deploy that configured nothing at all took real money from real buyers instead
# of failing. It now raises ImproperlyConfigured on first use, naming the variable.
#
# Set FAPSHI_BASE_URL to https://sandbox.fapshi.com for testing — sandbox has
# documented test numbers with deterministic outcomes (fapshi.SANDBOX_NUMBERS),
# which is the only way to exercise the failure path without asking a real
# operator to decline a real payment.
# ──────────────────────────────────────────────────────────────────────────────
FAPSHI_API_USER = env("FAPSHI_API_USER", default="")
FAPSHI_API_KEY  = env("FAPSHI_API_KEY", default="")
FAPSHI_BASE_URL = env("FAPSHI_BASE_URL", default="")

# Fapshi's floor for a single transaction. Configurable because it is Fapshi's
# number to change, not ours, and a hardcoded one would mean a code deploy to
# follow it.
FAPSHI_MIN_AMOUNT = env.int("FAPSHI_MIN_AMOUNT", default=100)

# The static string Fapshi echoes in the `x-wh-secret` header of every webhook.
# Not a signature — see fapshi.webhook_secret_ok for why it is checked with a
# constant-time compare anyway, and why an unset value does not fail closed.
# Created in the Fapshi dashboard and NOT readable afterwards, so record it when
# you set it.
FAPSHI_WEBHOOK_SECRET = env("FAPSHI_WEBHOOK_SECRET", default="")

# ──────────────────────────────────────────────────────────────────────────────
# Didit Verification
# ──────────────────────────────────────────────────────────────────────────────
DIDIT_API_KEY = env("DIDIT_API_KEY", default="")
