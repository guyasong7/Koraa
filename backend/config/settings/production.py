"""Production settings — extends base."""
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa

DEBUG = False

# ──────────────────────────────────────────────────────────────────────────────
# Security hardening
# ──────────────────────────────────────────────────────────────────────────────
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)  # noqa: F405
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"

# TLS terminates at the load balancer / nginx, so Django only sees plain HTTP.
# Without this it thinks every request is insecure and SECURE_SSL_REDIRECT
# sends the client into an infinite redirect loop.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

# Django rejects admin/session POSTs over HTTPS unless the origin is trusted.
# Defaults are derived from ALLOWED_HOSTS so a correct ALLOWED_HOSTS is enough.
CSRF_TRUSTED_ORIGINS = env.list(  # noqa: F405
    "CSRF_TRUSTED_ORIGINS",
    default=[
        f"https://{h.lstrip('.')}"
        for h in ALLOWED_HOSTS  # noqa: F405
        if h not in ("*", "localhost", "127.0.0.1")
    ],
)

if ALLOWED_HOSTS == ["localhost", "127.0.0.1"]:  # noqa: F405
    raise ImproperlyConfigured(
        "ALLOWED_HOSTS is still the development default. Set ALLOWED_HOSTS to "
        "your real domains before running with production settings."
    )

# SimpleJWT signs access tokens with SECRET_KEY, so a leaked or guessable key
# lets anyone mint a token for any merchant. The startproject default is not
# allowed to reach production.
if SECRET_KEY.startswith("django-insecure-") or len(SECRET_KEY) < 50:  # noqa: F405
    raise ImproperlyConfigured(
        "SECRET_KEY is the insecure development default. Generate a new one:\n"
        "  python -c 'import secrets; print(secrets.token_urlsafe(64))'\n"
        "and set SECRET_KEY in the environment before deploying."
    )

# ──────────────────────────────────────────────────────────────────────────────
# Static & media files
# ──────────────────────────────────────────────────────────────────────────────
MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")  # noqa: F405

# Cloudflare R2 is used for media when configured. All four values are required
# together; if any is missing, media falls back to local disk rather than
# raising ImproperlyConfigured at import time and refusing to boot at all.
R2_ACCESS_KEY_ID = env("R2_ACCESS_KEY_ID", default="")  # noqa: F405
R2_SECRET_ACCESS_KEY = env("R2_SECRET_ACCESS_KEY", default="")  # noqa: F405
R2_BUCKET_NAME = env("R2_BUCKET_NAME", default="")  # noqa: F405
R2_ENDPOINT_URL = env("R2_ENDPOINT_URL", default="")  # noqa: F405
R2_CUSTOM_DOMAIN = env("R2_CUSTOM_DOMAIN", default="")  # noqa: F405

USE_R2 = all([R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT_URL])

# The STORAGES dict replaces STATICFILES_STORAGE / DEFAULT_FILE_STORAGE, which
# are deprecated in Django 4.2 and removed in 5.1.
STORAGES = {
    "default": {
        "BACKEND": (
            "storages.backends.s3boto3.S3Boto3Storage"
            if USE_R2
            else "django.core.files.storage.FileSystemStorage"
        ),
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

if USE_R2:
    AWS_ACCESS_KEY_ID = R2_ACCESS_KEY_ID
    AWS_SECRET_ACCESS_KEY = R2_SECRET_ACCESS_KEY
    AWS_STORAGE_BUCKET_NAME = R2_BUCKET_NAME
    AWS_S3_ENDPOINT_URL = R2_ENDPOINT_URL
    AWS_S3_CUSTOM_DOMAIN = R2_CUSTOM_DOMAIN or None
    AWS_S3_FILE_OVERWRITE = False
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = False
    AWS_S3_OBJECT_PARAMETERS = {"CacheControl": "max-age=86400"}
    AWS_S3_SIGNATURE_VERSION = "s3v4"

# ──────────────────────────────────────────────────────────────────────────────
# Logging — to stdout, for the container runtime to collect.
# ──────────────────────────────────────────────────────────────────────────────
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": env("DJANGO_LOG_LEVEL", default="INFO"),  # noqa: F405
    },
    "loggers": {
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
        # Payment and payout failures need to be findable in the logs.
        "apps.payments": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "apps.orders": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}

# ──────────────────────────────────────────────────────────────────────────────
# Cache & sessions
# ──────────────────────────────────────────────────────────────────────────────
# Redis is not optional here. base.py falls back to LocMemCache so a laptop
# with nothing installed can run `runserver`, but that fallback is per-process
# and in production it fails quietly rather than loudly:
#
#   * DRF throttle counters live in this cache. Three gunicorn workers each
#     keeping their own means the configured "100/hour" is really 300/hour,
#     and every deploy hands attackers a fresh allowance.
#   * Every cached storefront payload and every Firebase certificate set is
#     fetched and stored once per worker, so the cache does a third of the work
#     it looks like it is doing.
#   * Nothing can be invalidated across workers. A merchant publishing a change
#     would clear it in whichever worker served the save.
#
# None of that raises an error or shows up in a log line, which is why this is
# a refusal to boot rather than a warning.
if not CACHES["default"]["BACKEND"].endswith("RedisCache"):  # noqa: F405
    raise ImproperlyConfigured(
        "REDIS_URL is not set, so the cache fell back to per-process memory. "
        "That silently breaks rate limiting and cache invalidation across "
        "workers. Set REDIS_URL (e.g. redis://redis:6379/0) before deploying."
    )

# Sessions read from the cache and write through to the database. Only the
# Django admin uses sessions here — the merchant dashboard and storefronts are
# JWT — so this is a small win, but `cached_db` is the right shape for it: the
# read is a cache hit and the session still survives a Redis restart, which
# `cache`-only sessions would not.
SESSION_ENGINE = "django.contrib.sessions.backends.cached_db"

# The token verification in apps/accounts/firebase.py checks a token's audience
# against this. If it is empty every Google sign-in fails with a mismatched
# audience, which reads like a client bug and is not one.
if not FIREBASE_PROJECT_ID:  # noqa: F405
    raise ImproperlyConfigured(
        "FIREBASE_PROJECT_ID is empty, so no Google sign-in can be verified. "
        "Set it to the Firebase project ID — the same value the frontend uses "
        "for NEXT_PUBLIC_FIREBASE_PROJECT_ID."
    )

# ──────────────────────────────────────────────────────────────────────────────
# Database — reuse connections instead of opening one per request.
# ──────────────────────────────────────────────────────────────────────────────
DATABASES["default"]["CONN_MAX_AGE"] = env.int("CONN_MAX_AGE", default=60)  # noqa: F405
DATABASES["default"].setdefault("OPTIONS", {})  # noqa: F405
DATABASES["default"]["OPTIONS"]["connect_timeout"] = 10  # noqa: F405
