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
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "order"
        verbose_name_plural = "orders"

    def __str__(self):
        return f"Order {self.id} - {self.store.name} ({self.total_amount})"

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
