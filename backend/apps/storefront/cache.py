"""
Caching for the public storefront payload.

── What is being cached and why ──

``PublicStorefrontByDomainView`` is the hottest endpoint in the product: the
storefront app calls it to render every page of every shop. Building one
response costs roughly eight queries — the domain mapping, the store, its
config, its enabled sections, up to fifty products with three prefetches, and
the service form — for content that only changes when a merchant edits their
shop. Serving that from Redis instead turns a customer's page view into one
cache read.

── Why a version counter rather than key deletion ──

The payload key depends on more than the store: absolute media URLs are built
from the incoming request, so a shop reachable at both ``bella.koraa.cm``
and ``bella.com`` has two valid payloads. Invalidation therefore cannot just
delete "the" key — it would have to know every host the shop has ever been
served on. Instead the key embeds a version, and invalidating means changing
the version so every old key becomes unreachable and expires on its own.

── Why the version is a timestamp, not a counter ──

Redis runs with ``allkeys-lru``, so any key can be evicted, including the
version. An incrementing counter that got evicted would restart at 1 and start
handing out keys that already hold *older* payloads — a stale shop, served
indefinitely, with no way to tell. A millisecond timestamp cannot collide with
anything already in the cache, because time only moves forward. Eviction of
the version then costs a single cache miss instead of correctness.

``cache.add`` rather than ``cache.set`` when filling a missing version, so two
requests arriving on a cold cache converge on one version instead of each
minting its own and neither ever hitting the other's entry.
"""

from __future__ import annotations

import logging
import time

from django.core.cache import cache

logger = logging.getLogger(__name__)

#: Backstop only. Correctness comes from the version bump, not from expiry —
#: this is the ceiling on how long a *missed* bump can serve stale content, and
#: how long an abandoned version's entries linger before Redis reclaims them.
PAYLOAD_TTL = 600  # 10 minutes

# There is deliberately no cache for the domain → store resolution, though it
# looks like the obvious next thing to add. ``_resolve_store_by_domain`` filters
# on PUBLISHED, so caching it would keep serving an unpublished shop for as long
# as the entry lived — a merchant who takes their shop down would watch it stay
# up. A miss there is one indexed query against one row, which is not the cost
# this module exists to remove.


def _version_key(store_id) -> str:
    return f"sf:ver:{store_id}"


def _new_version() -> str:
    """A version that cannot collide with one already in the cache."""
    return str(int(time.time() * 1000))


def version(store_id) -> str:
    """The current payload version for a store, minting one if absent."""
    key = _version_key(store_id)
    current = cache.get(key)
    if current is not None:
        return str(current)

    minted = _new_version()
    # None means "no expiry". `add` loses to whoever got there first, and the
    # re-read picks up their value, so concurrent cold requests agree.
    cache.add(key, minted, None)
    return str(cache.get(key) or minted)


def invalidate(store_id) -> None:
    """Make every cached payload for this store unreachable.

    Called from signals on everything the payload is built from. Cheap enough
    to call more often than strictly necessary — it is one write — and that is
    the right trade: an extra bump costs one rebuild, a missed bump shows a
    merchant their old shop and makes them think the save failed.
    """
    try:
        cache.set(_version_key(store_id), _new_version(), None)
    except Exception as exc:  # pragma: no cover - cache is optional
        # A cache that cannot be invalidated must not break the save that
        # triggered it. The payload TTL is the backstop for exactly this.
        logger.warning("Could not invalidate storefront cache for %s: %s", store_id, exc)


def _origin(request) -> str:
    """The part of the request that changes the payload's absolute URLs.

    In production media lives on R2 and ``build_absolute_uri`` returns those
    URLs untouched, so this rarely varies. In development ``MEDIA_URL`` is
    relative and the host is baked into every image URL, so keying on it is
    what stops a shop served on two hostnames from getting the other one's
    links.
    """
    return f"{request.scheme}://{request.get_host()}"


def payload_key(store_id, request, suffix: str = "full") -> str:
    return f"sf:payload:{store_id}:{version(store_id)}:{_origin(request)}:{suffix}"


def get_or_build(store_id, request, build, suffix: str = "full"):
    """Return the cached payload for a store, building and storing it on a miss.

    ``build`` is called with no arguments on a miss. Its result goes through the
    cache backend's pickle, which the storefront payloads survive: DRF's
    ``ReturnDict`` and ``ReturnList`` define ``__reduce__`` to reduce to a plain
    dict and list, dropping the serializer backlink rather than trying to pickle
    it. Do not put a model instance or a lazy queryset in a payload that comes
    through here — the first would be pickled whole and the second would be
    evaluated on unpickle, against a database connection that no longer exists.

    Cache failures are swallowed in both directions. Redis being unreachable
    should make storefronts slower, never broken.
    """
    # The key is built inside the try, not before it: `payload_key` calls
    # `version`, which reads and may write the cache. Computing it outside would
    # let a Redis outage raise straight out of this function and 500 every
    # storefront page — the one thing this handler exists to prevent.
    try:
        key = payload_key(store_id, request, suffix)
        cached = cache.get(key)
    except Exception as exc:  # pragma: no cover - cache is optional
        logger.warning("Storefront cache read failed: %s", exc)
        return build()

    if cached is not None:
        return cached

    payload = build()

    try:
        cache.set(key, payload, PAYLOAD_TTL)
    except Exception as exc:  # pragma: no cover - cache is optional
        logger.warning("Storefront cache write failed: %s", exc)

    return payload
