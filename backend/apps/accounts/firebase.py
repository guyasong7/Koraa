"""
Firebase ID token verification, with Google's public certificates cached.

── Why this module exists ──

`google.oauth2.id_token.verify_firebase_token` fetches Google's x.509
signing certificates from the network *every single time it is called*.
There is no cache anywhere in google-auth: `_fetch_certs` does a plain GET
and hands the JSON straight to the verifier. The old code also built a
fresh `google_requests.Request()` per login, which means a fresh
`requests.Session`, which means a fresh TCP connection and a fresh TLS
handshake to www.googleapis.com before the certificates could even start
downloading.

That put a full round trip to Google in front of every "Continue with
Google" — the one place a user is already waiting and watching. On a
Cameroonian mobile connection that is comfortably 300–600ms of dead time
for a payload that changes about once a day.

So: the certificate response is cached (Redis in production, LocMem in
dev), and the transport underneath is shared so the rare real fetch reuses
a warm connection. Verification itself stays exactly as strict — same
library, same signature check, same audience check, same clock-skew
handling. Only the certificate *delivery* is cached, and only for as long
as Google's own `Cache-Control` header says it may be.

── Why honouring max-age matters ──

These certificates rotate. Google publishes the next key alongside the
current one and sends a `Cache-Control: max-age` that expires well before
the overlap window closes, so a cache that respects it can never serve a
key set that has stopped being valid. A hardcoded TTL cannot make that
promise: too long and every login fails after a rotation, with a signature
error that looks like a client bug. If the header is missing or unreadable
we fall back to an hour and clamp the whole range, because a cache that is
wrong about how long it may cache is worse than one that refetches.
"""

from __future__ import annotations

import logging
import re

from django.conf import settings
from django.core.cache import cache
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

logger = logging.getLogger(__name__)

# Bounds on how long we will hold a certificate set, whatever Google says.
# The floor stops a pathological `max-age=0` from turning the cache off and
# handing every login a network round trip again; the ceiling keeps us well
# inside the rotation overlap even if a response ever advertises a week.
_MIN_TTL = 300  # 5 minutes
_MAX_TTL = 6 * 60 * 60  # 6 hours
_FALLBACK_TTL = 60 * 60  # 1 hour, when no max-age is readable

_MAX_AGE_RE = re.compile(r"max-age\s*=\s*(\d+)", re.IGNORECASE)

# One transport for the whole process. google-auth builds a `requests.Session`
# per `Request()` and never pools across instances, so sharing this is what
# keeps the connection to googleapis.com warm between the infrequent fetches
# that still reach the network.
_transport = google_requests.Request()


def _cache_key(url: str) -> str:
    """Key the cache by URL, not by a constant.

    google-auth reaches the certificates through a private module constant.
    If a library upgrade ever points Firebase verification at a different
    endpoint, keying by URL means we start filling a new cache entry rather
    than serving the old endpoint's keys under a name that no longer
    describes them.
    """
    return f"firebase:certs:{url}"


def _ttl_from_headers(headers) -> int:
    """Seconds we may cache this response, from its own Cache-Control."""
    raw = ""
    try:
        raw = headers.get("Cache-Control") or headers.get("cache-control") or ""
    except AttributeError:
        # A transport whose headers are not a mapping. Not worth crashing a
        # login over — take the conservative fallback instead.
        return _FALLBACK_TTL

    match = _MAX_AGE_RE.search(raw)
    if not match:
        return _FALLBACK_TTL
    return max(_MIN_TTL, min(_MAX_TTL, int(match.group(1))))


class _CachedResponse:
    """The two attributes `_fetch_certs` reads off a transport response.

    google.auth.transport.Response is an ABC over `status`, `headers` and
    `data`; the certificate path only ever touches `status` and `data`, but
    all three are here so this stays a truthful stand-in rather than a shape
    that happens to work today.
    """

    def __init__(self, data: bytes, headers: dict | None = None, status: int = 200):
        self.data = data
        self.headers = headers or {}
        self.status = status


class CachedCertsRequest:
    """A google-auth transport that serves the certificate URL from cache.

    Anything that is not a cacheable certificate GET is passed straight
    through to the shared transport untouched, so this is safe to hand to any
    google-auth call rather than only to the one it was written for.
    """

    def __call__(self, url, method="GET", body=None, headers=None, timeout=None, **kwargs):
        # Only GETs are cacheable, and only the bare URL — a request carrying
        # a body or custom headers is not the certificate fetch and must not
        # be answered from a cache keyed on URL alone.
        cacheable = method == "GET" and not body and not headers

        if cacheable:
            try:
                cached = cache.get(_cache_key(url))
            except Exception as exc:  # pragma: no cover - cache is optional
                # Same reasoning as the write below, and this side matters
                # more: production Redis has a 2s socket timeout, so an
                # unguarded read turned every blip into "invalid token" for
                # perfectly good credentials.
                logger.warning("Could not read Firebase certs from cache: %s", exc)
                cached = None
            if cached is not None:
                return _CachedResponse(cached)

        response = _transport(
            url, method=method, body=body, headers=headers, timeout=timeout, **kwargs
        )

        # Never cache a failure. A cached 500 would keep every login broken
        # for the length of the TTL, long after Google recovered.
        if cacheable and response.status == 200:
            try:
                cache.set(
                    _cache_key(url),
                    response.data,
                    _ttl_from_headers(response.headers),
                )
            except Exception as exc:  # pragma: no cover - cache is optional
                # Losing the cache costs latency, not correctness. A Redis
                # outage must not take Google sign-in down with it — in
                # either direction.
                logger.warning("Could not cache Firebase certs: %s", exc)

        return response


_cached_request = CachedCertsRequest()


def verify_firebase_id_token(token: str) -> dict:
    """Verify a Firebase ID token and return its claims.

    Raises whatever google-auth raises on an invalid token — a bad signature,
    a wrong audience, an expired `exp`. Callers are expected to treat any
    exception as "this token is not good" rather than to distinguish between
    them, because the distinctions are not safe to report to the client.

    The audience is read from settings rather than hardcoded: the staging and
    production Firebase projects have different IDs, and a hardcoded one made
    every token from the other project fail verification.
    """
    return id_token.verify_firebase_token(
        token,
        _cached_request,
        audience=settings.FIREBASE_PROJECT_ID,
    )


def warm_certs_cache() -> bool:
    """Fetch and cache the certificates ahead of the first login.

    Called at startup so the first person to press "Continue with Google"
    after a deploy does not pay for the cold cache. Returns whether the cache
    is now warm; never raises, because a boot must not fail over this.

    The endpoint is read off google-auth rather than copied here, so an
    upgrade that moves it warms the new URL instead of silently warming a
    cache entry nothing reads. `getattr` guards the day that constant is
    renamed: skipping the warm-up costs one slow login, an AttributeError at
    import time costs the whole service.
    """
    certs_url = getattr(id_token, "_GOOGLE_APIS_CERTS_URL", None)
    if not certs_url:
        logger.warning("Could not locate the Firebase certificate URL to warm.")
        return False

    try:
        # Straight through the caching transport, which fills the cache as a
        # side effect of the fetch — the same path a real login takes.
        return _cached_request(certs_url).status == 200
    except Exception as exc:
        logger.warning("Firebase certificate warm-up failed: %s", exc)
        return False
