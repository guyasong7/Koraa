"""StoreDomain model — maps hostnames to stores."""

import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _


class StoreDomain(models.Model):
    """
    Maps a hostname (subdomain or custom domain) to a Store.
    One store can have multiple domains; one is primary.
    """

    class DomainType(models.TextChoices):
        SUBDOMAIN = "subdomain", _("Koraa Subdomain")
        CUSTOM = "custom_domain", _("Custom Domain")

    class Status(models.TextChoices):
        ACTIVE = "active", _("Active")
        PENDING = "pending", _("Pending Verification")
        FAILED = "failed", _("Verification Failed")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="domains",
    )
    domain = models.CharField(
        max_length=255,
        unique=True,
        help_text="e.g. bella-fashion.koraa.cm or bellafashion.com",
    )
    type = models.CharField(
        max_length=20,
        choices=DomainType.choices,
        default=DomainType.SUBDOMAIN,
    )
    is_primary = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("store domain")
        verbose_name_plural = _("store domains")
        indexes = [models.Index(fields=["domain"])]

    def __str__(self):
        return f"{self.domain} → {self.store.name}"
