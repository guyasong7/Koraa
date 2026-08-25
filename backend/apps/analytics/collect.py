"""
Turning one HTTP request into one :class:`~apps.analytics.models.Event`.

Everything a browser sends that could identify a person is reduced here, before
anything is written: the IP address and user agent become one unlinkable daily
hash, the referrer becomes a hostname, the path loses its query string.
"""

import hashlib
import re
from urllib.parse import urlsplit

from django.conf import settings
from django.utils import timezone

from .models import Event

#: What the collect endpoint will accept. Anything else is dropped rather than
#: stored as an unknown kind, so a typo in the tracker cannot pollute the table.
ALLOWED_KINDS = frozenset(Event.Kind.values)

MAX_PATH = 300
MAX_REFERRER = 200
MAX_LABEL = 200


def client_ip(request) -> str:
    """The visitor's address, trusting the proxy header only for its first hop.

    ``X-Forwarded-For`` is appended to by each proxy, so the left-most entry is
    the client — and also the only one a client can forge. That is acceptable
    here: a forged address changes which hash a view is counted under, not
    whether it is counted, and the value is thrown away either way.
    """
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "") or ""


def visitor_key(request, store) -> str:
    """A visitor id that stops being one at midnight.

    The salt is ``SECRET_KEY`` plus today's local date plus the store, so the
    same hash cannot be recognised tomorrow, cannot be recognised on another
    shop, and cannot be reversed by anyone who does not hold the secret. Which
    means the table cannot be used to follow somebody, by us or by anybody who
    takes a copy of it.

    Truncated to 32 hex characters. That is 128 bits — collisions are not a
    practical concern at any traffic a shop on this platform will see, and the
    shorter value keeps the index small.
    """
    parts = "|".join([
        settings.SECRET_KEY,
        timezone.localdate().isoformat(),
        str(getattr(store, "id", store)),
        client_ip(request),
        request.META.get("HTTP_USER_AGENT", "")[:400],
    ])
    return hashlib.sha256(parts.encode("utf-8")).hexdigest()[:32]


def clean_path(value) -> str:
    """A storefront path, without the query string or the host.

    A path arriving as a whole URL (a tracker that sent ``location.href``) is
    reduced to its path, so the same page is never counted as two.
    """
    text = str(value or "").strip()
    if not text:
        return ""
    if "//" in text:
        text = urlsplit(text).path or "/"
    text = text.split("?")[0].split("#")[0]
    if not text.startswith("/"):
        text = "/" + text
    # A trailing slash is the same page as none; picking one keeps "/shop" and
    # "/shop/" from splitting the top-pages list in half.
    if len(text) > 1:
        text = text.rstrip("/") or "/"
    return text[:MAX_PATH]


def referrer_host(value, store_hosts=()) -> str:
    """The hostname a visitor came from, or "" for direct and internal traffic.

    ``store_hosts`` are the shop's own hostnames. Internal navigation is not a
    referrer, and counting it as one would put the shop's own domain at the top
    of every merchant's traffic sources.
    """
    text = str(value or "").strip()
    if not text:
        return ""
    host = urlsplit(text if "//" in text else f"//{text}").hostname or ""
    host = host.lower().removeprefix("www.")
    if not host:
        return ""
    if any(host == h or host.endswith(f".{h}") for h in store_hosts if h):
        return ""
    return host[:MAX_REFERRER]


#: Order matters: a tablet user agent usually also says "mobile" somewhere, so
#: the tablet test has to run first.
_TABLET = re.compile(r"ipad|tablet|playbook|silk|(android(?!.*mobile))", re.I)
_MOBILE = re.compile(r"android|iphone|ipod|windows phone|blackberry|mobile", re.I)


def device_from_ua(user_agent: str) -> str:
    """Desktop, mobile or tablet, from the user agent alone.

    Deliberately crude. The alternative is a device database that has to be kept
    up to date to stay accurate, in exchange for a distinction no merchant on
    this platform is going to act on beyond "should I care about small screens".
    An unrecognised agent is reported as unknown rather than assumed to be a
    desktop.
    """
    if not user_agent:
        return Event.Device.UNKNOWN
    if _TABLET.search(user_agent):
        return Event.Device.TABLET
    if _MOBILE.search(user_agent):
        return Event.Device.MOBILE
    return Event.Device.DESKTOP


def store_hostnames(store) -> tuple:
    """Every host that is this shop, for the internal-referrer test."""
    hosts = [f"{store.slug}.{getattr(settings, 'KORAA_STOREFRONT_DOMAIN', '')}".rstrip(".")]
    custom = getattr(store, "custom_domain", "")
    if custom:
        hosts.append(str(custom).lower().removeprefix("www."))
    return tuple(h.split(":")[0].lower() for h in hosts if h)


def record(request, store, *, kind: str, path="", referrer="", product=None, label="") -> Event | None:
    """Write one event, or ``None`` if the kind is not one we collect."""
    if kind not in ALLOWED_KINDS:
        return None

    user_agent = request.META.get("HTTP_USER_AGENT", "")
    return Event.objects.create(
        store=store,
        kind=kind,
        path=clean_path(path),
        referrer=referrer_host(referrer, store_hostnames(store)),
        device=device_from_ua(user_agent),
        visitor=visitor_key(request, store),
        product=product,
        label=str(label or "")[:MAX_LABEL],
    )
