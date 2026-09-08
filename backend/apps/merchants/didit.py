"""Didit identity verification — v3 session-based flow.

Creates a hosted verification session, returns the URL for the merchant
to complete ID + liveness + face-match in Didit's UI, then receives the
result via webhook (or polling fallback).
"""
import hashlib
import hmac
import logging
import time

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

DIDIT_API_KEY = getattr(settings, "DIDIT_API_KEY", "")
DIDIT_WORKFLOW_ID = getattr(settings, "DIDIT_WORKFLOW_ID", "")
DIDIT_WEBHOOK_SECRET = getattr(settings, "DIDIT_WEBHOOK_SECRET", "")
DIDIT_BASE_URL = "https://verification.didit.me/v3"


def _headers():
    if not DIDIT_API_KEY:
        raise ValueError("DIDIT_API_KEY is not configured.")
    return {
        "x-api-key": DIDIT_API_KEY,
        "Content-Type": "application/json",
    }


def create_session(*, vendor_data, redirect_url=None, metadata=None):
    """Create a Didit verification session.

    Returns the full response dict including `session_id`, `url`,
    `session_token`, and `status`.

    The `callback` field in Didit's API is the URL the user is redirected
    to after completing verification (not the webhook). Webhooks are
    configured separately in the Didit dashboard.
    """
    if not DIDIT_WORKFLOW_ID:
        raise ValueError("DIDIT_WORKFLOW_ID is not configured.")

    payload = {
        "workflow_id": DIDIT_WORKFLOW_ID,
        "vendor_data": str(vendor_data),
    }
    if redirect_url:
        payload["callback"] = redirect_url
    if metadata:
        payload["metadata"] = metadata

    resp = requests.post(
        f"{DIDIT_BASE_URL}/session/",
        headers=_headers(),
        json=payload,
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def get_decision(session_id):
    """Poll a session's decision (fallback when webhook is missed)."""
    resp = requests.get(
        f"{DIDIT_BASE_URL}/session/{session_id}/decision/",
        headers={"x-api-key": DIDIT_API_KEY},
        timeout=15,
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()


def verify_webhook_signature(payload_bytes, signature, timestamp, max_age=300):
    """Verify X-Signature-V2 from Didit.

    Returns True if valid, False otherwise.
    """
    if not DIDIT_WEBHOOK_SECRET:
        logger.warning("DIDIT_WEBHOOK_SECRET not set — skipping signature check")
        return True

    if timestamp:
        try:
            ts = int(timestamp)
            if abs(time.time() - ts) > max_age:
                logger.warning("Didit webhook timestamp too old: %s", timestamp)
                return False
        except (ValueError, TypeError):
            pass

    expected = hmac.new(
        DIDIT_WEBHOOK_SECRET.encode(),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature or "")


def process_webhook(data):
    """Process a Didit status.updated webhook payload.

    Updates the MerchantIdentity row and returns (identity, changed).
    Returns (None, False) if the session doesn't match any merchant.
    """
    from .models import MerchantIdentity

    session_id = data.get("session_id")
    status = data.get("status", "")
    decision = data.get("decision") or {}

    try:
        identity = MerchantIdentity.objects.select_related("merchant").get(
            didit_session_id=session_id
        )
    except MerchantIdentity.DoesNotExist:
        logger.warning("Didit webhook for unknown session %s", session_id)
        return None, False

    identity.verification_status = status

    # Extract data from the decision object
    id_verifications = decision.get("id_verifications") or []
    if id_verifications:
        iv = id_verifications[0]
        doc_data = iv.get("data") or {}
        identity.first_name = doc_data.get("first_name") or identity.first_name
        identity.last_name = doc_data.get("last_name") or identity.last_name
        identity.document_type = doc_data.get("document_type") or identity.document_type
        identity.document_number = doc_data.get("document_number") or identity.document_number

    face_matches = decision.get("face_matches") or []
    if face_matches:
        fm = face_matches[0]
        identity.face_match_status = fm.get("status") or identity.face_match_status
        if fm.get("score") is not None:
            identity.face_match_score = fm["score"]

    # Collect warnings from all checks
    warnings = []
    for check_type in ("id_verifications", "liveness_checks", "face_matches"):
        for check in (decision.get(check_type) or []):
            for w in (check.get("warnings") or []):
                warnings.append(w if isinstance(w, dict) else {"message": str(w)})
    if warnings:
        identity.warnings = warnings

    identity.save()

    logger.info(
        "Didit session %s updated to %s for merchant %s",
        session_id, status, identity.merchant_id,
    )
    return identity, True
