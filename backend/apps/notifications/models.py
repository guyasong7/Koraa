"""Notifications models."""
import uuid
from django.conf import settings
from django.db import models


class Notification(models.Model):
    class Type(models.TextChoices):
        TEAM_INVITE = "team_invite", "Team Invite"
        TEAM_INVITE_ACCEPTED = "team_invite_accepted", "Team Invite Accepted"
        TEAM_INVITE_REJECTED = "team_invite_rejected", "Team Invite Rejected"
        ORDER_PLACED = "order_placed", "Order Placed"
        PLAN_EXPIRING = "plan_expiring", "Plan Expiring"
        PLAN_EXPIRED = "plan_expired", "Plan Expired"
        GENERAL = "general", "General"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sent_notifications",
    )
    type = models.CharField(max_length=40, choices=Type.choices, default=Type.GENERAL)
    title = models.CharField(max_length=255)
    body = models.TextField()
    # Arbitrary payload — e.g. {"staff_id": "...", "merchant_name": "...", "role": "manager"}
    data = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "notification"
        verbose_name_plural = "notifications"

    def __str__(self):
        return f"[{self.type}] → {self.recipient.email}: {self.title}"
