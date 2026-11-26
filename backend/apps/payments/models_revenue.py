"""
Revenue split model for template marketplace.
"""

from django.db import models
from django.conf import settings
import uuid


class RevenueSplit(models.Model):
    """
    Track revenue splits for template sales.

    For each template purchase, we create two records:
    - One for platform (30%)
    - One for creator (70%)
    """

    class RecipientType(models.TextChoices):
        PLATFORM = "platform", "Platform"
        CREATOR = "creator", "Creator"

    class PayoutStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transaction = models.ForeignKey(
        "payments.PaymentTransaction",
        on_delete=models.CASCADE,
        related_name="revenue_splits"
    )

    # Recipient
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Creator user (null for platform)"
    )
    recipient_type = models.CharField(
        max_length=20,
        choices=RecipientType.choices
    )

    # Amount
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="XAF")

    # Payout tracking
    payout_status = models.CharField(
        max_length=20,
        choices=PayoutStatus.choices,
        default=PayoutStatus.PENDING
    )
    payout_reference = models.CharField(max_length=100, blank=True)
    payout_date = models.DateTimeField(null=True, blank=True)

    # Metadata
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "revenue_splits"
        indexes = [
            models.Index(fields=["recipient", "payout_status"]),
            models.Index(fields=["recipient_type", "payout_status"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        recipient_name = (
            self.recipient.email if self.recipient
            else "Platform"
        )
        return f"{recipient_name} - {self.amount} {self.currency} ({self.payout_status})"
