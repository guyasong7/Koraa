"""
Merchants models.

A Merchant is the business profile tied to a User account.
One user can have one merchant profile (1-to-1).
A Merchant can own multiple Stores.

Design:
- UUID primary keys
- Tenant isolation: all downstream queries filter by merchant
- Subscription tier tracked here (free → starter → pro → enterprise)
"""

import uuid
from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class Merchant(models.Model):
    """
    Business profile for a merchant on the Koraa platform.
    Created automatically on first login or explicitly by the user.
    """

    class SubscriptionTier(models.TextChoices):
        FREE = "free", _("Free")
        STARTER = "starter", _("Starter")
        PRO = "pro", _("Pro")
        ENTERPRISE = "enterprise", _("Enterprise")

    class BusinessType(models.TextChoices):
        RETAIL = "retail", _("Retail Store")
        FASHION = "fashion", _("Fashion & Apparel")
        BEAUTY = "beauty", _("Beauty & Cosmetics")
        FOOD = "food", _("Food & Beverages")
        ELECTRONICS = "electronics", _("Electronics")
        DIGITAL = "digital", _("Digital Products")
        SERVICES = "services", _("Services")
        OTHER = "other", _("Other")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="merchant",
    )

    # Business identity
    business_name = models.CharField(_("business name"), max_length=255)
    business_type = models.CharField(
        _("business type"),
        max_length=30,
        choices=BusinessType.choices,
        default=BusinessType.RETAIL,
    )
    description = models.TextField(_("description"), blank=True)
    logo = models.ImageField(_("logo"), upload_to="merchants/logos/", blank=True, null=True)
    banner = models.ImageField(_("banner"), upload_to="merchants/banners/", blank=True, null=True)

    # Contact & Location
    email = models.EmailField(_("business email"), blank=True)
    phone = models.CharField(_("business phone"), max_length=20, blank=True)
    whatsapp = models.CharField(_("WhatsApp number"), max_length=20, blank=True)
    country = models.CharField(_("country"), max_length=2, default="CM")  # ISO 3166-1 alpha-2
    city = models.CharField(_("city"), max_length=100, blank=True)
    address = models.TextField(_("address"), blank=True)

    # Subscription
    tier = models.CharField(
        _("subscription tier"),
        max_length=20,
        choices=SubscriptionTier.choices,
        default=SubscriptionTier.FREE,
    )
    tier_expires_at = models.DateTimeField(_("tier expires at"), null=True, blank=True)

    # Verification
    is_verified = models.BooleanField(_("business verified"), default=False)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("merchant")
        verbose_name_plural = _("merchants")
        ordering = ["-created_at"]

    def __str__(self):
        return self.business_name

    @property
    def is_pro(self):
        from django.utils import timezone
        if self.tier in (self.SubscriptionTier.PRO, self.SubscriptionTier.ENTERPRISE):
            if self.tier_expires_at is None or self.tier_expires_at > timezone.now():
                return True
        return False

    @property
    def can_create_store(self):
        from apps.stores.models import Store
        if self.is_pro:
            return True
        store_count = Store.objects.filter(merchant=self).count()
        return store_count < settings.KORAA_MAX_STORES_FREE

    @property
    def store_count(self):
        return self.stores.count()

class MerchantIdentity(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.OneToOneField(Merchant, on_delete=models.CASCADE, related_name="identity")
    
    # Verifications
    location_verified = models.BooleanField(default=False)
    phone_verified = models.BooleanField(default=False)
    
    # Documents
    id_document = models.FileField(upload_to="merchants/identity_docs/", blank=True, null=True)
    id_document_verified = models.BooleanField(default=False)
    
    business_document = models.FileField(upload_to="merchants/business_docs/", blank=True, null=True)
    business_document_verified = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
