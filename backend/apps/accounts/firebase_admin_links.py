"""
Firebase Admin SDK — action-link generation and email sending.

── What this replaces ──

The old flow had Firebase send its own generic email (from
noreply@koraa-a3ecd.firebaseapp.com) linking to its default hosted
action page. This module replaces both:

  1. The link is generated here with `generate_email_verification_link`
     or `generate_password_reset_link`, baking our custom action URL
     (https://koraa.cm/_/auth/action) into the link Firebase generates.

  2. The email is sent by our own code, using Resend / SMTP, so it
     carries the Koraa brand and lands from noreply@koraa.cm.

── ActionCodeSettings ──

Every link carries ActionCodeSettings that set `url` to our custom
action handler. Firebase bakes the URL into the signed `oobCode` it
generates, so the link itself looks like:

  https://koraa-a3ecd.firebaseapp.com/__/auth/action?mode=...&oobCode=...
  &continueUrl=https%3A%2F%2Fkoraa.cm%2F_%2Fauth%2Faction

When a user clicks it, Firebase validates the code and then redirects
them to the continueUrl — which is our /_/auth/action page.

── Authentication ──

The Admin SDK can be initialised in two ways:

  A. Service Account JSON (FIREBASE_SERVICE_ACCOUNT_JSON env var) —
     the full credential object from the Firebase console. Preferred for
     production because it requires no ambient GCP identity.

  B. Application Default Credentials (ADC) — falls through to this when
     the JSON is absent, for environments that have a GCP service account
     attached (Cloud Run, GKE, etc.).

Both paths use the same project ID (FIREBASE_PROJECT_ID), which is
already in settings.py for token verification.

── Thread safety ──

`firebase_admin.initialize_app` is called once at import time, guarded
by the SDK's own duplicate-app check. The resulting app object is a
module-level singleton; every call after the first re-uses it.
"""

from __future__ import annotations

import json
import logging
import os

from django.conf import settings

logger = logging.getLogger(__name__)

# ── SDK initialisation ────────────────────────────────────────────────────────

def _init_app():
    """Initialise the Firebase Admin app exactly once."""
    import firebase_admin
    from firebase_admin import credentials

    # Already initialised — return the existing default app.
    try:
        return firebase_admin.get_app()
    except ValueError:
        pass

    project_id = getattr(settings, "FIREBASE_PROJECT_ID", "")
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")

    if sa_json:
        try:
            cred = credentials.Certificate(json.loads(sa_json))
        except (json.JSONDecodeError, ValueError) as exc:
            # If the env var exists but is malformed, surface it clearly at
            # startup rather than letting the first link-generation call fail.
            raise RuntimeError(
                "FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed "
                f"as JSON: {exc}"
            ) from exc
    else:
        # ADC — works on GCP instances with an attached service account.
        # Falls back to the user's own `gcloud auth application-default login`
        # credentials in local dev when the env var is absent.
        logger.info(
            "FIREBASE_SERVICE_ACCOUNT_JSON not set; "
            "falling back to Application Default Credentials."
        )
        cred = credentials.ApplicationDefault()

    return firebase_admin.initialize_app(
        cred,
        {"projectId": project_id} if project_id else {},
    )


# Initialise on import so any misconfiguration surfaces at startup, not on the
# first email send. The `try/except` in `_init_app` makes this idempotent.
try:
    _app = _init_app()
except Exception as _exc:  # pragma: no cover
    logger.warning("Firebase Admin SDK could not be initialised: %s", _exc)
    _app = None


# ── Action code settings ──────────────────────────────────────────────────────

def _action_code_settings():
    """
    Build ActionCodeSettings that point every Firebase email link at our
    custom action handler instead of Firebase's own hosted page.

    The `url` here is the *continue URL* — where Firebase redirects after
    validating the oobCode. The frontend's `/_/auth/action` page reads the
    `mode` and `oobCode` query params and finishes the operation in our UI.
    """
    from firebase_admin import auth as firebase_auth

    root = getattr(settings, "KORAA_DASHBOARD_URL", "https://koraa.cm").rstrip("/")
    # Always HTTPS except on local dev where the dashboard URL starts with http.
    action_url = f"{root}/_/auth/action"

    return firebase_auth.ActionCodeSettings(
        url=action_url,
        handle_code_in_app=True,
    )


# ── Public API ────────────────────────────────────────────────────────────────

def generate_email_verification_link(email: str) -> str:
    """
    Generate a Firebase email-verification action link for `email`.

    The link is signed by Firebase and contains an `oobCode` that our
    `/_/auth/action` handler exchanges via `applyActionCode` in the browser.

    Raises `firebase_admin.auth.UserNotFoundError` if the email does not
    correspond to a Firebase user. Callers should catch it and handle the
    case where Firebase has no account yet (e.g. the user signed up via
    OTP only and has no Firebase UID).
    """
    from firebase_admin import auth as firebase_auth

    if _app is None:
        raise RuntimeError("Firebase Admin SDK is not initialised.")

    return firebase_auth.generate_email_verification_link(
        email,
        action_code_settings=_action_code_settings(),
        app=_app,
    )


def generate_password_reset_link(email: str) -> str:
    """
    Generate a Firebase password-reset action link for `email`.

    Raises `firebase_admin.auth.UserNotFoundError` if the email is not
    registered in Firebase. The caller decides whether to surface that
    (for admin use) or swallow it (for public-facing endpoints where
    enumeration must be prevented).
    """
    from firebase_admin import auth as firebase_auth

    if _app is None:
        raise RuntimeError("Firebase Admin SDK is not initialised.")

    return firebase_auth.generate_password_reset_link(
        email,
        action_code_settings=_action_code_settings(),
        app=_app,
    )


def generate_sign_in_with_email_link(email: str) -> str:
    """
    Generate a Firebase email sign-in (passwordless) link for `email`.

    This is the link used for email-link sign-in (magic link). The link
    carries `mode=signIn` and is handled by the `/_/auth/action` page.
    """
    from firebase_admin import auth as firebase_auth

    if _app is None:
        raise RuntimeError("Firebase Admin SDK is not initialised.")

    return firebase_auth.generate_sign_in_with_email_link(
        email,
        action_code_settings=_action_code_settings(),
        app=_app,
    )
