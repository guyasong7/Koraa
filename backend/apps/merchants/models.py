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

    # Referral Program
    referral_code = models.CharField(_("referral code"), max_length=20, unique=True, blank=True, null=True)
    referred_by = models.ForeignKey(
        "self", 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name="referrals"
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("merchant")
        verbose_name_plural = _("merchants")
        ordering = ["-created_at"]

    def __str__(self):
        return self.business_name

    def save(self, *args, **kwargs):
        if not self.referral_code:
            import string, random
            # Generate a 6-character alphanumeric referral code based on business name
            base = "".join(filter(str.isalnum, self.business_name)).upper()[:4]
            suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
            self.referral_code = f"{base}{suffix}" if base else suffix
        super().save(*args, **kwargs)

    @property
    def effective_tier(self):
        """The tier that should actually be enforced right now.

        ``tier`` is the tier they bought; this is the tier they still have.
        A lapsed ``tier_expires_at`` used to be honoured by ``is_pro`` but
        ignored by ``can_create_store`` and ``can_add_product``, so an
        expired Pro merchant kept unlimited stores and products forever.
        Everything gates on this property now.
        """
        from django.utils import timezone
        from .plans import normalise

        tier = normalise(self.tier)
        if tier == "free":
            return tier
        if self.tier_expires_at is not None and self.tier_expires_at <= timezone.now():
            return "free"
        return tier

    @property
    def is_pro(self):
        from .plans import at_least
        return at_least(self.effective_tier, "pro")

    def limit(self, key):
        """Numeric ceiling for ``key`` on the currently effective tier."""
        from .plans import limit
        return limit(self.effective_tier, key)

    def has_feature(self, key):
        from .plans import has_feature
        return has_feature(self.effective_tier, key)

    @property
    def can_create_store(self):
        from apps.stores.models import Store
        return Store.objects.filter(merchant=self).count() < self.limit("stores")

    @property
    def can_add_product(self):
        from apps.products.models import Product
        return (
            Product.objects.filter(store__merchant=self).count()
            < self.limit("products")
        )

    @property
    def can_add_staff(self):
        return self.staff_members.count() < self.limit("staff")

    @property
    def store_count(self):
        return self.stores.count()

    def usage(self):
        """Counts and ceilings for the dashboard's plan-usage widget.

        ``None`` means unlimited — see ``plans.public_catalogue`` for why
        infinity is not serialised as-is.
        """
        from apps.products.models import Product
        from .plans import UNLIMITED

        def cap(value):
            return None if value == UNLIMITED else value

        return {
            "tier": self.effective_tier,
            "stores": {
                "used": self.stores.count(),
                "limit": cap(self.limit("stores")),
            },
            "products": {
                "used": Product.objects.filter(store__merchant=self).count(),
                "limit": cap(self.limit("products")),
            },
            "staff": {
                "used": self.staff_members.count(),
                "limit": cap(self.limit("staff")),
            },
            "storefront_templates": {
                "limit": cap(self.limit("storefront_templates")),
            },
        }

class MerchantIdentity(models.Model):
    class VerificationStatus(models.TextChoices):
        PENDING = "Pending", "Pending"
        VERIFIED = "Verified", "Verified"
        REFUSED = "Refused", "Refused picture wasnt clear and they should upload again"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.OneToOneField(Merchant, on_delete=models.CASCADE, related_name="identity")
    
    # Verifications
    location_verified = models.BooleanField(default=False)
    phone_verified = models.BooleanField(default=False)
    
    # Documents
    id_document = models.FileField(upload_to="merchants/identity_docs/", blank=True, null=True)
    id_document_back = models.FileField(upload_to="merchants/identity_docs/", blank=True, null=True)
    selfie_with_id = models.FileField(upload_to="merchants/identity_docs/selfies/", blank=True, null=True)
    id_document_verified = models.BooleanField(default=False)
    
    # Didit API Fields — ID Verification
    didit_request_id = models.CharField(max_length=255, blank=True, null=True)
    verification_status = models.CharField(max_length=100, choices=VerificationStatus.choices, default=VerificationStatus.PENDING)
    first_name = models.CharField(max_length=255, blank=True, null=True)
    last_name = models.CharField(max_length=255, blank=True, null=True)
    document_type = models.CharField(max_length=100, blank=True, null=True)
    document_number = models.CharField(max_length=100, blank=True, null=True)
    warnings = models.JSONField(default=list, blank=True)
    
    # Didit API Fields — Face Match (selfie vs. ID)
    face_match_status = models.CharField(max_length=50, blank=True, null=True)
    face_match_score = models.FloatField(blank=True, null=True)
    
    business_document = models.FileField(upload_to="merchants/business_docs/", blank=True, null=True)
    business_document_verified = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        old_verified = False
        if not is_new:
            try:
                old_instance = MerchantIdentity.objects.get(pk=self.pk)
                old_verified = old_instance.id_document_verified
            except MerchantIdentity.DoesNotExist:
                pass

        # If admin manually changes status, sync booleans and warnings
        if self.verification_status == self.VerificationStatus.VERIFIED:
            self.id_document_verified = True
            self.warnings = []
        elif self.verification_status == self.VerificationStatus.REFUSED:
            self.id_document_verified = False
            self.warnings = [{"message": self.VerificationStatus.REFUSED.label}]

        super().save(*args, **kwargs)

        # Trigger notification and update merchant if newly verified
        if not old_verified and self.id_document_verified:
            from apps.notifications.models import Notification
            Notification.objects.create(
                recipient=self.merchant.user,
                type=Notification.Type.GENERAL,
                title="Identity Verification Approved",
                body="Your identity documents have been manually reviewed and verified successfully. Your merchant account is now fully approved.",
            )
            if not self.merchant.is_verified:
                self.merchant.is_verified = True
                self.merchant.save(update_fields=["is_verified"])

class MerchantStaff(models.Model):
    """
    Someone the owner invited to help run one of their stores.

    Access is per store, not per account. An owner with a bakery and a
    boutique can hand a manager the boutique without also handing over the
    bakery's orders and revenue, so the store being shared is part of the
    invite rather than something implied by it.
    """
    class Role(models.TextChoices):
        ADMIN = "admin", _("Admin")
        MANAGER = "manager", _("Store Manager")
        SUPPORT = "support", _("Customer Support")

    class Status(models.TextChoices):
        PENDING = "pending", _("Pending")
        ACCEPTED = "accepted", _("Accepted")
        REJECTED = "rejected", _("Rejected")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name="staff_members")
    #: The one store this invite grants access to.
    #:
    #: NULL means every store on the account, which is what invites accepted
    #: before this field existed had granted. Nothing creates NULL rows any
    #: more — MerchantTeamView requires a store — so a NULL here only ever
    #: describes an older row, and apps.stores.access honours it as such.
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="shared_with",
        null=True,
        blank=True,
        help_text="Store this member can manage. Empty means the whole account (legacy invites).",
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="merchant_employments")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.MANAGER)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # One row per person per store, so the same teammate can hold
        # different roles on two of the owner's shops.
        unique_together = ("merchant", "user", "store")
        ordering = ["-created_at"]

    def __str__(self):
        scope = self.store.name if self.store_id else self.merchant.business_name
        return f"{self.user.email} - {scope} ({self.role})"


class MerchantPayoutAccount(models.Model):
    """
    Fapshi mobile money payout accounts for merchants.
    """
    class Provider(models.TextChoices):
        MTN = "MTN", "MTN"
        ORANGE = "Orange", "Orange"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name="payout_accounts")
    provider = models.CharField(max_length=10, choices=Provider.choices, default=Provider.MTN)
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20)
    is_default = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.provider} - {self.phone})"
