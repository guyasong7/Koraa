"""Discount codes — created by merchants, applied at checkout.

A DiscountCode belongs to a Store. The merchant sets the code string, a type
(percentage or fixed), a value, optional min-order and max-uses limits, and a
validity window. Checkout validates the code, computes the discount amount,
and records both on the Order.
"""

import uuid
from decimal import Decimal

from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.stores.models import Store


class DiscountCode(models.Model):
    class DiscountType(models.TextChoices):
        PERCENTAGE = "percentage", _("Percentage")
        FIXED = "fixed", _("Fixed amount")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(
        Store, on_delete=models.CASCADE, related_name="discount_codes"
    )
    code = models.CharField(
        max_length=50,
        help_text="Case-insensitive code the buyer types at checkout.",
    )
    discount_type = models.CharField(
        max_length=10, choices=DiscountType.choices, default=DiscountType.PERCENTAGE
    )
    discount_value = models.DecimalField(
        max_digits=10, decimal_places=2,
        help_text="Percentage (0-100) or fixed amount in store currency.",
    )
    min_order_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text="Minimum subtotal before the code is accepted.",
    )
    max_uses = models.PositiveIntegerField(
        default=0, help_text="0 = unlimited."
    )
    used_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    valid_from = models.DateTimeField(null=True, blank=True)
    valid_until = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("store", "code")]
        ordering = ["-created_at"]
        verbose_name = _("discount code")
        verbose_name_plural = _("discount codes")

    def __str__(self):
        return f"{self.code} ({self.store.name})"

    @property
    def is_valid(self) -> bool:
        if not self.is_active:
            return False
        if self.max_uses and self.used_count >= self.max_uses:
            return False
        now = timezone.now()
        if self.valid_from and now < self.valid_from:
            return False
        if self.valid_until and now > self.valid_until:
            return False
        return True

    def compute_discount(self, subtotal: Decimal) -> Decimal:
        """How much to subtract from *subtotal*. Never negative, never exceeds it."""
        if self.discount_type == self.DiscountType.PERCENTAGE:
            raw = (subtotal * self.discount_value / Decimal("100")).quantize(
                Decimal("1")
            )
        else:
            raw = self.discount_value
        return min(max(raw, Decimal("0")), subtotal)

    def increment_usage(self):
        DiscountCode.objects.filter(pk=self.pk).update(
            used_count=models.F("used_count") + 1
        )
