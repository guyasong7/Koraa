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
        SUCCESSFUL = "successful", "Successful"
        FAILED = "failed", "Failed"
        EXPIRED = "expired", "Expired"

    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="transactions", null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="payment_transactions")
    fapshi_trans_id = models.CharField(max_length=100, unique=True)
    payment_link = models.URLField(blank=True)
    amount = models.IntegerField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.INITIATED)
    plan = models.CharField(max_length=20, choices=Plan.choices)
    billing_cycle = models.CharField(max_length=10, default="monthly")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"TX {self.fapshi_trans_id} — {self.user.email} — {self.status}"
