"""Startup warnings about the payment configuration.

Every check here is about one failure mode: a mismatch between the environment
someone *thinks* they are in and the one their credentials point at. Getting that
wrong in either direction is expensive — charging real buyers from a laptop, or
launching with sandbox keys and wondering why no money arrives — and neither
shows up until a payment is attempted.

These are warnings, never errors. ``manage.py check --deploy`` runs before
``migrate`` in most deploy scripts, and a hard error here would block a deploy
over a payment setting that plenty of management commands never touch.
"""

from django.conf import settings
from django.core.checks import Warning as CheckWarning, register

#: Fapshi's own hostnames, so a check can tell the two apart without a substring
#: match on something like a proxy URL that happens to contain "live".
LIVE_HOST = "live.fapshi.com"
SANDBOX_HOST = "sandbox.fapshi.com"


@register()
def fapshi_environment_check(app_configs, **kwargs):
    """Flag a Fapshi configuration that is likely to surprise someone."""
    errors = []
    base = (getattr(settings, "FAPSHI_BASE_URL", "") or "").strip()
    api_user = (getattr(settings, "FAPSHI_API_USER", "") or "").strip()
    api_key = (getattr(settings, "FAPSHI_API_KEY", "") or "").strip()

    if not base:
        errors.append(
            CheckWarning(
                "FAPSHI_BASE_URL is not set, so no payment can be taken.",
                hint=(
                    f"Set https://{SANDBOX_HOST} for testing or https://{LIVE_HOST} "
                    "to move real money. There is deliberately no default — the "
                    "previous default was live, so a misconfigured deploy took "
                    "real payments. apps.payments.fapshi raises "
                    "ImproperlyConfigured at the first call."
                ),
                id="payments.W001",
            )
        )
    elif LIVE_HOST in base and settings.DEBUG:
        errors.append(
            CheckWarning(
                "FAPSHI_BASE_URL points at live Fapshi while DEBUG=True.",
                hint=(
                    "Every checkout from this process charges a real mobile money "
                    f"account. Point FAPSHI_BASE_URL at https://{SANDBOX_HOST} for "
                    "development; it has test numbers with fixed outcomes "
                    "(apps.payments.fapshi.SANDBOX_NUMBERS), which live cannot "
                    "give you. Sandbox needs its own credentials."
                ),
                id="payments.W002",
            )
        )
    elif SANDBOX_HOST in base and not settings.DEBUG:
        # The mirror image, and the one that gets noticed late: the shop works,
        # buyers "pay", nothing arrives.
        errors.append(
            CheckWarning(
                "FAPSHI_BASE_URL points at sandbox Fapshi with DEBUG=False.",
                hint=(
                    "Payments will look like they work and no money will move. "
                    f"Use https://{LIVE_HOST} in production."
                ),
                id="payments.W003",
            )
        )

    if base and not (api_user and api_key):
        missing = " and ".join(
            name for name, value in
            (("FAPSHI_API_USER", api_user), ("FAPSHI_API_KEY", api_key))
            if not value
        )
        errors.append(
            CheckWarning(
                f"{missing} not set, so Fapshi will reject every request.",
                hint=(
                    "Both come from the Fapshi dashboard, and sandbox and live "
                    "credentials are not interchangeable."
                ),
                id="payments.W004",
            )
        )

    return errors
