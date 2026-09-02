"""
Camoo SMS — lightweight Python client for the Camoo SMS gateway.

Translated from the PHP SDK's Message::create() / send() pattern:

    $oMessage = Message::create('API_KEY', 'API_SECRET');
    $oMessage->from    = 'YourCompany';
    $oMessage->to      = '+237612345678';
    $oMessage->message = 'Your OTP is 123456';
    $oMessage->send();

Usage:

    from apps.accounts.camoo_sms import send_sms
    ok, info = send_sms(to='+237612345678', message='Your Koraa code is 482910')

The credentials are read from Django settings, which reads them from the
environment — CAMOO_API_KEY and CAMOO_API_SECRET. The sender ID defaults to
'Koraa' (max 11 characters for alphanumeric sender IDs on Camoo).
"""

from __future__ import annotations

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# Camoo SMS REST API endpoint (v1)
_API_URL = "https://www.camoo.cm/api/v2/sms/send"

# Hard timeout — Camoo is a local gateway; 10 s is generous.
_TIMEOUT = 10


def send_sms(to: str, message: str, sender: str | None = None) -> tuple[bool, dict]:
    """
    Send an SMS via the Camoo gateway.

    Parameters
    ----------
    to:
        Recipient phone number in E.164 format, e.g. ``+237612345678``.
        Camoo accepts the leading ``+`` or the bare country code.
    message:
        The text body. Keep it under 160 characters for a single-part SMS.
    sender:
        Alphanumeric sender ID (max 11 chars). Defaults to ``settings.CAMOO_SENDER_ID``
        or the string ``'Koraa'``.

    Returns
    -------
    (success: bool, response_data: dict)
        ``success`` is True if Camoo returned status 200 and no error code.
        ``response_data`` contains the raw decoded JSON for logging.
    """
    api_key    = getattr(settings, "CAMOO_API_KEY",    "")
    api_secret = getattr(settings, "CAMOO_API_SECRET", "")
    sender_id  = sender or getattr(settings, "CAMOO_SENDER_ID", "Koraa")

    if not api_key or not api_secret:
        logger.error(
            "Camoo SMS is not configured. "
            "Set CAMOO_API_KEY and CAMOO_API_SECRET in the environment."
        )
        return False, {"error": "Camoo SMS credentials not configured."}

    # Normalise the number — Camoo accepts '+237...' directly.
    phone = to.strip()

    payload = {
        "api_key":    api_key,
        "api_secret": api_secret,
        "from":       sender_id,
        "to":         phone,
        "message":    message,
    }

    try:
        response = requests.post(_API_URL, data=payload, timeout=_TIMEOUT)
        data = response.json()
    except requests.Timeout:
        logger.warning("Camoo SMS request timed out for %s", phone)
        return False, {"error": "Gateway timeout"}
    except Exception as exc:
        logger.warning("Camoo SMS request failed for %s: %s", phone, exc)
        return False, {"error": str(exc)}

    # Camoo returns {"status": "OK", "message": "..."} on success
    # and {"status": "FAILED", "error_code": ..., "message": "..."} on failure.
    success = (
        response.status_code == 200
        and str(data.get("status", "")).upper() == "OK"
    )

    if not success:
        logger.warning(
            "Camoo SMS delivery failed for %s — status %s, response: %s",
            phone, response.status_code, data,
        )
    else:
        logger.info("Camoo SMS sent to %s", phone)

    return success, data
