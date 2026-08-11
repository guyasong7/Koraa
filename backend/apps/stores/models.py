"""
Stores models.

A Store is a tenant — the isolated ecommerce storefront.
Each Store:
  - Belongs to a Merchant
  - Has a subdomain on koraa.africa (e.g. yourbrand.koraa.africa)
  - Has a chosen Theme/Template
  - Has a Status lifecycle: draft → preview → published → suspended

Downstream resources (products, orders, customers) are all scoped to a Store.
"""

import uuid
from django.db import models
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _
from django.conf import settings


class Store(models.Model):
    """
    The core tenant object on Koraa.
    Everything — products, orders, customers — belongs to a Store.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", _("Draft")
        PREVIEW = "preview", _("Preview")
        PUBLISHED = "published", _("Published")
        SUSPENDED = "suspended", _("Suspended")

    class Currency(models.TextChoices):
        XAF = "XAF", _("Central African CFA Franc (XAF)")
        NGN = "NGN", _("Nigerian Naira (NGN)")
        GHS = "GHS", _("Ghanaian Cedi (GHS)")
        KES = "KES", _("Kenyan Shilling (KES)")
        ZAR = "ZAR", _("South African Rand (ZAR)")
        USD = "USD", _("US Dollar (USD)")
        EUR = "EUR", _("Euro (EUR)")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(
        "merchants.Merchant",
        on_delete=models.CASCADE,
        related_name="stores",
    )

    # Identity
    name = models.CharField(_("store name"), max_length=255)
    slug = models.SlugField(
        _("subdomain slug"),
        max_length=63,
        unique=True,
        help_text="Used as subdomain: slug.koraa.africa",
    )
    tagline = models.CharField(_("tagline"), max_length=255, blank=True)
    description = models.TextField(_("description"), blank=True)

    # Branding
    logo = models.ImageField(_("logo"), upload_to="stores/logos/", blank=True, null=True)
    favicon = models.ImageField(_("favicon"), upload_to="stores/favicons/", blank=True, null=True)
    banner = models.ImageField(_("banner"), upload_to="stores/banners/", blank=True, null=True)

    # Theme
    theme = models.ForeignKey(
        "themes.Theme",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stores",
    )
    theme_config = models.JSONField(
        _("theme configuration"),
        default=dict,
        blank=True,
        help_text="Stores color overrides, font choices, section ordering, etc.",
    )

    # Regional settings
    currency = models.CharField(
        _("currency"),
        max_length=3,
        choices=Currency.choices,
        default=Currency.XAF,
    )
    country = models.CharField(_("country"), max_length=2, default="CM")
    language = models.CharField(_("language"), max_length=10, default="en")

    # Contact
    email = models.EmailField(_("contact email"), blank=True)
    phone = models.CharField(_("contact phone"), max_length=20, blank=True)
    whatsapp = models.CharField(_("WhatsApp"), max_length=20, blank=True)
    instagram = models.URLField(_("Instagram"), blank=True)
    facebook = models.URLField(_("Facebook"), blank=True)

    # Custom domain
    custom_domain = models.CharField(
        _("custom domain"),
        max_length=255,
        blank=True,
        null=True,
        unique=True,
        help_text="e.g. shop.mybrand.com",
    )
    domain_verified = models.BooleanField(default=False)
    domain_expires_at = models.DateTimeField(_("domain expiration date"), null=True, blank=True)

    # Status
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    published_at = models.DateTimeField(null=True, blank=True)

    # SEO
    seo_title = models.CharField(_("SEO title"), max_length=70, blank=True)
    seo_description = models.CharField(_("SEO description"), max_length=160, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("store")
        verbose_name_plural = _("stores")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["slug"]),
            models.Index(fields=["merchant", "status"]),
            models.Index(fields=["custom_domain"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.slug}.{settings.KORAA_STOREFRONT_DOMAIN})"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = self._generate_unique_slug()
        super().save(*args, **kwargs)

    def _generate_unique_slug(self):
        base_slug = slugify(self.name)[:50]
        slug = base_slug
        counter = 1
        while Store.objects.filter(slug=slug).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1
        return slug

    @property
    def storefront_url(self):
        if self.custom_domain and self.domain_verified:
            return f"https://{self.custom_domain}"
        return f"https://{self.slug}.{settings.KORAA_STOREFRONT_DOMAIN}"

    @property
    def is_live(self):
        return self.status == self.Status.PUBLISHED

    def publish(self):
        from django.utils import timezone
        self.status = self.Status.PUBLISHED
        self.published_at = timezone.now()
        self.save(update_fields=["status", "published_at"])

    def unpublish(self):
        self.status = self.Status.DRAFT
        self.save(update_fields=["status"])
