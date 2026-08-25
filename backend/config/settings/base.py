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
USE_S3 = env.bool("USE_S3", default=False)

if USE_S3:
    AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME")
    AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME")
    AWS_S3_CUSTOM_DOMAIN = f"{AWS_STORAGE_BUCKET_NAME}.s3.amazonaws.com"
    AWS_DEFAULT_ACL = "public-read"
    AWS_S3_OBJECT_PARAMETERS = {
        "CacheControl": "max-age=86400",
    }
    
    # Media files on S3
    DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"
    MEDIA_URL = f"https://{AWS_S3_CUSTOM_DOMAIN}/media/"
    
    # Static files on S3 (optional, often we just serve static via whitenoise, but S3 is fine)
    # STATICFILES_STORAGE = "storages.backends.s3boto3.S3StaticStorage"
    # STATIC_URL = f"https://{AWS_S3_CUSTOM_DOMAIN}/static/"
    
    STATIC_URL = "/static/"
    STATIC_ROOT = BASE_DIR / "staticfiles"
else:
    STATIC_URL = "/static/"
    STATIC_ROOT = BASE_DIR / "staticfiles"
    MEDIA_URL = "/media/"
    MEDIA_ROOT = BASE_DIR / "media"

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
    },
}

# ──────────────────────────────────────────────────────────────────────────────
# JWT — SimpleJWT
# ──────────────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
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
KORAA_ROOT_DOMAIN = env("KORAA_ROOT_DOMAIN", default="koraa.africa")

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
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Koraa <noreply@koraa.africa>")

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
# ──────────────────────────────────────────────────────────────────────────────
FAPSHI_API_USER = env("FAPSHI_API_USER", default="")
FAPSHI_API_KEY  = env("FAPSHI_API_KEY", default="")
FAPSHI_BASE_URL = env("FAPSHI_BASE_URL", default="https://live.fapshi.com")

# ──────────────────────────────────────────────────────────────────────────────
# Didit Verification
# ──────────────────────────────────────────────────────────────────────────────
DIDIT_API_KEY = env("DIDIT_API_KEY", default="")
