from django.db import models
from apps.accounts.models import User


class Plan(models.TextChoices):
    FREE = "free", "Free"
    STARTER = "starter", "Starter"
    PRO = "pro", "Pro"
    ENTERPRISE = "enterprise", "Enterprise"


class Subscription(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PENDING = "pending", "Pending"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="subscriptions")
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.FREE)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    billing_cycle = models.CharField(max_length=10, choices=[("monthly", "Monthly"), ("yearly", "Yearly")], default="monthly")
    amount_paid = models.IntegerField(default=0)
    fapshi_trans_id = models.CharField(max_length=100, blank=True, null=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    #: When the "your plan expires in a week" notice went out for *this* term.
    #: Null on renewal, so each term warns exactly once. See
    #: ``payments.lifecycle.warn_expiring_subscriptions``.
    expiry_notice_sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.email} — {self.plan} ({self.status})"


class PaymentTransaction(models.Model):
    class Status(models.TextChoices):
        INITIATED = "initiated", "Initiated"
        PENDING = "pending", "Pending"
        SUCCESSFUL = "successful", "Successful"
        FAILED = "failed", "Failed"
        EXPIRED = "expired", "Expired"

    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="transactions", null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="payment_transactions")

    # Support both subscription and template purchases
    external_id = models.CharField(max_length=100, unique=True, help_text="Our reference (order-123, template-uuid, etc.)")
    fapshi_trans_id = models.CharField(max_length=100, blank=True, db_index=True)
    fapshi_transaction_id = models.CharField(max_length=100, blank=True, help_text="Alias for fapshi_trans_id")

    payment_link = models.URLField(blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="XAF")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.INITIATED)

    # Optional fields for subscriptions
    plan = models.CharField(max_length=20, choices=Plan.choices, blank=True)
    billing_cycle = models.CharField(max_length=10, default="monthly", blank=True)

    # Payment provider
    provider = models.CharField(max_length=20, default="fapshi")

    # Metadata for flexible use (templates, orders, etc.)
    metadata = models.JSONField(default=dict, blank=True)

    #: The idempotency marker for activation — the same role ``settled_at`` plays
    #: on ``Order``.
    #:
    #: ``status`` cannot do this job. It is set to SUCCESSFUL first and read
    #: unlocked, so two concurrent settles both saw INITIATED and both ran the
    #: activation: the term was extended twice and the referral bonus paid twice.
    #: This is written under ``select_for_update`` in the same transaction as
    #: that work, which is what makes the second caller stop.
    settled_at = models.DateTimeField(null=True, blank=True, db_index=True)

    #: Fapshi's raw status string, for diagnosis. ``status`` collapses EXPIRED
    #: and FAILED onto separate choices already, but this also captures CREATED
    #: and PENDING, which have nowhere else to live.
    fapshi_status = models.CharField(max_length=32, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"TX {self.fapshi_trans_id} — {self.user.email} — {self.status}"

    @property
    def is_settled(self) -> bool:
        """Whether activation has already run. Read this, not ``status``."""
        return self.settled_at is not None


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

    import uuid

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transaction = models.ForeignKey(
        PaymentTransaction,
        on_delete=models.CASCADE,
        related_name="revenue_splits"
    )

    # Recipient
    recipient = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="template_revenues",
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
