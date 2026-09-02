"""
Camoo SMS — Python client for the Camoo SMS API v1.

Official API reference: https://api.camoo.cm/v1/sms.json

Authentication is via custom HTTP headers (NOT Basic Auth, NOT body params):
    X-Api-Key:    <api_key>
    X-Api-Secret: <api_secret>
    User-Agent:   CamooSms/ApiClient

Body is form-encoded:
    to      — E.164 recipient, e.g. +237612345678
    from    — Alphanumeric sender ID (max 11 chars)
    message — SMS body

Success response shape:
    { "_message": "success", "sms": { "code": 200, "message-count": 1, ... } }
"""

from __future__ import annotations

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

_API_URL = "https://api.camoo.cm/v1/sms.json"
_TIMEOUT = 15


def send_sms(to: str, message: str, sender: str | None = None) -> tuple[bool, dict]:
    """
    Send an SMS via the Camoo gateway.

    Parameters
    ----------
    to:
        Recipient in E.164 format, e.g. ``+237683140781``.
    message:
        Text body (max 160 chars for single-part SMS).
    sender:
        Alphanumeric sender ID (max 11 chars).
        Defaults to ``settings.CAMOO_SENDER_ID`` or ``'Koraa'``.

    Returns
    -------
    (success: bool, response_data: dict)
    """
    api_key    = getattr(settings, "CAMOO_API_KEY",    "")
    api_secret = getattr(settings, "CAMOO_API_SECRET", "")
    sender_id  = sender or getattr(settings, "CAMOO_SENDER_ID", "Koraa")

    if not api_key or not api_secret:
        logger.error(
            "Camoo SMS not configured — set CAMOO_API_KEY and CAMOO_API_SECRET."
        )
        return False, {"error": "Camoo SMS credentials not configured."}

    headers = {
        "X-Api-Key":    api_key,
        "X-Api-Secret": api_secret,
        "User-Agent":   "CamooSms/ApiClient",
    }

    payload = {
        "from":    sender_id,
        "to":      to.strip(),
        "message": message,
    }

    try:
        response = requests.post(
            _API_URL, headers=headers, data=payload, timeout=_TIMEOUT
        )
        data = response.json()
    except requests.Timeout:
        logger.warning("Camoo SMS request timed out for %s", to)
        return False, {"error": "Gateway timeout"}
    except Exception as exc:
        logger.warning("Camoo SMS request failed for %s: %s", to, exc)
        return False, {"error": str(exc)}

    # Success: HTTP 200 AND sms.code == 200
    sms_code = data.get("sms", {}).get("code")
    success  = response.status_code == 200 and str(sms_code) == "200"

    if success:
        logger.info("Camoo SMS sent to %s (msg-id: %s)",
                    to, data.get("sms", {}).get("messages", [{}])[0].get("message-id", "?")
                    if isinstance(data.get("sms", {}).get("messages"), list) else "?")
    else:
        logger.warning(
            "Camoo SMS failed for %s — HTTP %s, sms.code %s, body: %s",
            to, response.status_code, sms_code, data,
        )

    return success, data
