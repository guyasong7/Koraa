"""
What visitors do on a storefront.

One table, not several. A page view and an add-to-cart differ only in ``kind``,
so splitting them would mean two ingest paths, two sets of indexes, and two
places to change when the next event type is added. Traffic reads the page
views; engagement reads the rest.

**Nothing here identifies a person.** There is no cookie, no ``localStorage``
id and no stored IP address. ``visitor`` is a SHA-256 hash of the address, the
user agent, the store and *today's date*, salted with ``SECRET_KEY`` — see
:func:`apps.analytics.collect.visitor_key`. That makes the value useless as a
lasting identifier and useless to anybody who gets a copy of the table.

The cost of that choice is stated plainly in the dashboard: a visitor is
counted once per day, so a 30-day visitor figure is the sum of 30 daily counts
rather than 30 days of distinct people. Counting distinct people over a month
would mean keeping something that follows one for a month, which is exactly
what this avoids.

**Sales and enquiries are deliberately absent.** ``orders.Order`` and
``storefront.FormSubmission`` already hold those exactly, for every visitor,
regardless of whether they agreed to be measured. A second sampled copy would
only give the merchant two numbers to disbelieve, so the sales and enquiry
figures on the analytics page are read from those tables instead.
"""

import uuid

from django.db import models
from django.utils.translation import gettext_lazy as _


class Event(models.Model):
    """One thing that happened on a storefront.

    Rows are written by the public collect endpoint and never updated. They are
    also never required: a visitor who declined the cookie banner, or who blocks
    the request, simply produces none — every figure derived from this table is
    a floor, not a census. The dashboard says so where it matters.
    """

    class Kind(models.TextChoices):
        #: Any storefront page. The unit of "traffic".
        PAGE_VIEW = "page_view", _("Page view")
        #: A product page or quick-view opened. Carries ``product``.
        PRODUCT_VIEW = "product_view", _("Product view")
        ADD_TO_CART = "add_to_cart", _("Added to cart")
        #: Reached checkout, whether or not they paid. Pairs with the order
        #: count to give an abandonment figure.
        CHECKOUT_START = "checkout_start", _("Started checkout")
        #: Used the storefront search. ``label`` holds the term.
        SEARCH = "search", _("Searched")

    class Device(models.TextChoices):
        DESKTOP = "desktop", _("Desktop")
        MOBILE = "mobile", _("Mobile")
        TABLET = "tablet", _("Tablet")
        #: Guessed wrong or not sent. Kept as its own value rather than folded
        #: into desktop, so the split is not quietly flattering to one column.
        UNKNOWN = "unknown", _("Unknown")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(
        "stores.Store", on_delete=models.CASCADE, related_name="analytics_events"
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)

    #: Path only — no query string, no host. A query string on a storefront is
    #: a filter or a search term, and neither belongs in a table this long-lived.
    path = models.CharField(_("path"), max_length=300, blank=True)

    #: Host of the referring page, not the whole URL. "google.com" is the useful
    #: part; the rest is somebody else's private reading history.
    referrer = models.CharField(_("referrer"), max_length=200, blank=True)

    device = models.CharField(max_length=10, choices=Device.choices, default=Device.UNKNOWN)

    #: Daily-rotating salted hash. See the module docstring.
    visitor = models.CharField(max_length=64, blank=True)

    product = models.ForeignKey(
        "products.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="analytics_events",
    )
    #: A search term, or a product name kept as it read at the time. Free text,
    #: capped, and never shown as a link.
    label = models.CharField(_("label"), max_length=200, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("event")
        verbose_name_plural = _("events")
        ordering = ["-created_at"]
        # Named rather than left to Django's hash, so the migration reads as
        # English and does not churn if the model moves. Every report filters
        # store + date range, and most also filter kind; the third index carries
        # the per-product breakdown on the engagement tab.
        indexes = [
            models.Index(fields=["store", "-created_at"], name="an_event_recent"),
            models.Index(fields=["store", "kind", "-created_at"], name="an_event_kind"),
            models.Index(fields=["store", "product"], name="an_event_product"),
        ]

    def __str__(self):
        return f"{self.get_kind_display()} — {self.store_id} — {self.created_at:%Y-%m-%d}"
