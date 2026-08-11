"""Development settings — extends base."""
from .base import *  # noqa

DEBUG = True

# Allow all hosts in development
ALLOWED_HOSTS = ["*"]

# Use console email backend
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Django Debug Toolbar (optional — add to requirements-dev.txt if needed)
INTERNAL_IPS = ["127.0.0.1"]

# Relaxed password validation for dev
AUTH_PASSWORD_VALIDATORS = []
