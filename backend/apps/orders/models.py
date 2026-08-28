"""
Order models.

  Order         — one checkout, its customer details and payment state
  OrderItem     — one line, with the name and price snapshotted at purchase
  DownloadGrant — a paid buyer's link to a digital product's files

Physical and digital sales share the same Order: a basket may hold both, and
splitting them would mean two payments for one checkout. What differs is what
happens after payment — a physical line is shipped, a digital line mints a
grant. See ``apps.orders.downloads``.
"""

import secrets
import uuid
from datetime import timedelta

from django.db import models
from django.utils import timezone
from apps.stores.models import Store
from apps.products.models import Product

class Order(models.Model):
    class PaymentStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"

    class PayoutStatus(models.TextChoices):
        """Whether the merchant has been paid for this sale.

        Separate from ``payment_status`` because they answer different questions
        and can disagree in the way that matters most: an order can be PAID —
        Koraa holds the buyer's money — while the merchant's share is still
        sitting here because their payout bounced. Before these fields existed
        that state was invisible; a failed payout wrote a line to the log and
        nothing else, so there was no way to find out who was owed money, let
        alone retry it.
        """

        PENDING = "pending", "Pending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        #: Fapshi accepted the payout but we never got the reply, so money may or
        #: may not have moved. Never retried automatically — a human checks the
        #: Fapshi dashboard, because the alternative is paying twice.
        UNKNOWN = "unknown", "Unknown — verify with Fapshi"
        #: Nothing to send: the merchant has no payout account on file, or the
        #: net came to zero.
        NOT_APPLICABLE = "not_applicable", "Not applicable"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name="orders")

    # Customer Details
    customer_name = models.CharField(max_length=255)
    customer_email = models.EmailField()
    customer_phone = models.CharField(max_length=20, blank=True)
    shipping_address = models.TextField()
    city = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=20, blank=True)

    # Financials
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)

    # Payment Tracking
    payment_status = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)
    fapshi_trans_id = models.CharField(max_length=100, blank=True, null=True)
    payment_link = models.URLField(max_length=500, blank=True, null=True)

    #: The idempotency marker for settlement, and the reason a merchant cannot be
    #: paid twice for one sale.
    #:
    #: Fapshi can deliver a webhook and a browser poll for the same payment, and
    #: ``reconcile_orders`` may arrive at it a third time. Each of those used to
    #: read ``payment_status`` unlocked and act on it, so two concurrent settles
    #: both saw "pending" and both paid the merchant out. This is set under
    #: ``select_for_update`` inside the same transaction as the payout, which is
    #: what makes the second caller see the work as already done.
    #:
    #: Distinct from ``updated_at`` (any write touches that) and from
    #: ``paid_at`` (when the money moved, as against when Koraa reacted).
    settled_at = models.DateTimeField(null=True, blank=True, db_index=True)

    #: Fapshi's own status string, kept verbatim for diagnosis.
    #:
    #: ``payment_status`` deliberately has only three values, so Fapshi's EXPIRED
    #: and FAILED both land on FAILED — the buyer-visible outcome is identical and
    #: collapsing them keeps every existing consumer working. This is where the
    #: distinction survives, and it is the first field to look at when a merchant
    #: asks why a specific order failed.
    fapshi_status = models.CharField(max_length=32, blank=True)

    #: When Fapshi says the money actually moved (its ``dateConfirmed``), which
    #: can be hours before ``settled_at`` if a webhook was lost and a reconcile
    #: pass caught it. Null on orders settled before this field existed.
    paid_at = models.DateTimeField(null=True, blank=True)

    #: The operator's reference (Fapshi's ``financialTransId``) — what a buyer or
    #: merchant disputing a payment quotes to their MTN or Orange agent.
    financial_trans_id = models.CharField(max_length=100, blank=True)

    #: What Koraa actually received: Fapshi's ``revenue``, i.e. the charge less
    #: Fapshi's own fee. Not the same as ``total_amount``, and the gap is the
    #: reason this is recorded rather than inferred — a payout computed from the
    #: gross can exceed what came in.
    fapshi_revenue = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )

    # Merchant payout
    payout_status = models.CharField(
        max_length=20, choices=PayoutStatus.choices, default=PayoutStatus.PENDING
    )
    payout_amount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    #: Fapshi's transId for the payout, so a merchant asking "where is my money"
    #: has an answer that can be looked up rather than a log line to grep for.
    payout_reference = models.CharField(max_length=100, blank=True)
    payout_at = models.DateTimeField(null=True, blank=True)
    #: Why a payout failed, in Fapshi's words. Read straight off the admin list.
    payout_error = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "order"
        verbose_name_plural = "orders"
        indexes = [
            # The reconcile command's query: pending orders that have a Fapshi
            # transaction to ask about, oldest first.
            models.Index(
                fields=["payment_status", "created_at"],
                name="order_status_created_idx",
            ),
            # Every settle path starts by looking an order up by the trans_id a
            # webhook handed it. Not unique: see the note in the migration about
            # why the constraint that belongs here is deferred.
            models.Index(fields=["fapshi_trans_id"], name="order_fapshi_trans_idx"),
        ]

    def __str__(self):
        return f"Order {self.id} - {self.store.name} ({self.total_amount})"

    @property
    def is_settled(self) -> bool:
        """Whether settlement has already run for this order.

        Read this rather than ``payment_status == PAID``: a failed payment is
        settled too, and asking about the status is what let the old code settle
        the same order twice.
        """
        return self.settled_at is not None

class OrderItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, related_name="order_items")

    # Snapshot data in case product changes/deleted
    product_name = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.quantity}x {self.product_name}"


def _mint_token() -> str:
    """A download token: 43 URL-safe characters, ~256 bits.

    Long enough that guessing is not an attack, and the only thing standing
    between a stranger and the file — so it is generated with ``secrets``, not
    ``uuid4`` or anything seeded from the clock.
    """
    return secrets.token_urlsafe(32)


class DownloadGrant(models.Model):
    """One buyer's right to download one digital product.

    Minted when an order is paid, never before — an unpaid order that handed out
    a link would be giving the file away. One row per (order, product) so a
    basket with two digital products yields two links, each listing that
    product's files.

    The limits are copied from the product at mint time rather than read through
    the relation on each request: a merchant who later shortens the window has
    changed the offer for future buyers, not clawed back what someone already
    paid for.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name="download_grants"
    )
    product = models.ForeignKey(
        Product, on_delete=models.SET_NULL, null=True, related_name="download_grants"
    )
    #: Snapshot, for the same reason OrderItem keeps product_name.
    product_name = models.CharField(max_length=255)

    token = models.CharField(max_length=64, unique=True, default=_mint_token, editable=False)

    #: 0 means unlimited, matching Product.download_limit.
    max_downloads = models.PositiveIntegerField(default=5)
    download_count = models.PositiveIntegerField(default=0)
    #: Null means it never expires, matching download_window_days = 0.
    expires_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    last_downloaded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "download grant"
        verbose_name_plural = "download grants"
        ordering = ["-created_at"]
        unique_together = [("order", "product")]
        # No index on `token`: unique=True already creates one, and a second
        # index on the same column costs writes and buys nothing.

    def __str__(self):
        return f"{self.product_name} → {self.order.customer_email}"

    @classmethod
    def mint(cls, order, product):
        """Create (or return) the grant for one product on one paid order.

        Idempotent, because the Fapshi callback and the webhook can both settle
        the same order and a second call must not reset the download count or
        push the expiry out.
        """
        window = product.download_window_days
        grant, _created = cls.objects.get_or_create(
            order=order,
            product=product,
            defaults={
                "product_name": product.name,
                "max_downloads": product.download_limit,
                "expires_at": (
                    timezone.now() + timedelta(days=window) if window else None
                ),
            },
        )
        return grant

    @property
    def is_expired(self) -> bool:
        return bool(self.expires_at and timezone.now() >= self.expires_at)

    @property
    def is_exhausted(self) -> bool:
        return bool(self.max_downloads and self.download_count >= self.max_downloads)

    @property
    def downloads_remaining(self):
        """Remaining downloads, or None when the grant is unlimited."""
        if not self.max_downloads:
            return None
        return max(self.max_downloads - self.download_count, 0)

    @property
    def is_usable(self) -> bool:
        return not (self.is_expired or self.is_exhausted)

    def record_download(self):
        """Count one download.

        Uses an F() update so two tabs started at once cannot both read 4 and
        both write 5, which is how a 5-download limit becomes a 6-download one.
        """
        DownloadGrant.objects.filter(pk=self.pk).update(
            download_count=models.F("download_count") + 1,
            last_downloaded_at=timezone.now(),
        )
        self.refresh_from_db(fields=["download_count", "last_downloaded_at"])
