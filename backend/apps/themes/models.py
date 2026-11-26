"""
Themes models.

A Theme is a professionally designed storefront template.
Themes are platform-managed (created by Koraa team, not merchants).
Merchants choose a theme and can customize colors, fonts, section order via
Store.theme_config (a JSON field).

Extended to support:
- Custom user-created templates (Template model)
- Template marketplace with purchases
- Template reviews and ratings
- Template versions
"""

import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.core.validators import MinValueValidator, MaxValueValidator
from django.conf import settings


class Theme(models.Model):
    """A storefront template available on the platform."""

    class Category(models.TextChoices):
        FASHION = "fashion", _("Fashion")
        FOOD = "food", _("Food & Beverage")
        ELECTRONICS = "electronics", _("Electronics")
        BEAUTY = "beauty", _("Beauty")
        GENERAL = "general", _("General")
        MINIMAL = "minimal", _("Minimal")
        BOLD = "bold", _("Bold")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(_("name"), max_length=100)
    slug = models.SlugField(_("slug"), unique=True)
    description = models.TextField(_("description"), blank=True)
    category = models.CharField(
        _("category"), max_length=30, choices=Category.choices, default=Category.GENERAL
    )

    # Previews
    preview_image = models.ImageField(
        _("preview image"), upload_to="themes/previews/", blank=True, null=True
    )
    preview_url = models.URLField(_("live preview URL"), blank=True)

    # Configuration schema (tells the customizer what fields are available)
    config_schema = models.JSONField(
        _("configuration schema"),
        default=dict,
        help_text="Defines customizable fields (colors, fonts, sections)",
    )
    default_config = models.JSONField(
        _("default configuration"),
        default=dict,
        help_text="Default values for theme configuration",
    )

    # Availability
    is_free = models.BooleanField(_("free tier"), default=True)
    is_active = models.BooleanField(_("active"), default=True)
    sort_order = models.PositiveIntegerField(_("sort order"), default=0)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("theme")
        verbose_name_plural = _("themes")
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class Template(models.Model):
    """
    Custom storefront template (user-created or marketplace).

    Templates extend the base Theme system to allow:
    - Community/developer contributions
    - Custom Next.js implementations
    - Marketplace sales
    - Version management
    """

    class TemplateType(models.TextChoices):
        OFFICIAL = "official", _("Official")  # Created by Koraa team
        COMMUNITY = "community", _("Community")  # Open source, free
        PREMIUM = "premium", _("Premium")  # Paid marketplace template

    class Status(models.TextChoices):
        DRAFT = "draft", _("Draft")
        PENDING_REVIEW = "pending_review", _("Pending Review")
        APPROVED = "approved", _("Approved")
        REJECTED = "rejected", _("Rejected")
        ARCHIVED = "archived", _("Archived")

    # Identity
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(_("slug"), max_length=100, unique=True)
    name = models.CharField(_("name"), max_length=100)
    description = models.TextField(_("description"))
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="templates"
    )

    # Classification
    template_type = models.CharField(
        _("template type"),
        max_length=20,
        choices=TemplateType.choices,
        default=TemplateType.COMMUNITY
    )
    category = models.CharField(
        _("category"),
        max_length=30,
        choices=Theme.Category.choices,
        default=Theme.Category.GENERAL
    )
    tags = models.JSONField(_("tags"), default=list, blank=True)

    # Visual assets
    thumbnail = models.ImageField(
        _("thumbnail"),
        upload_to="templates/thumbnails/",
        help_text="Main preview image (recommended: 1200x800)"
    )
    screenshots = models.JSONField(
        _("screenshots"),
        default=list,
        blank=True,
        help_text="List of screenshot URLs"
    )
    demo_url = models.URLField(_("demo URL"), blank=True)

    # Package
    package_url = models.URLField(
        _("package URL"),
        help_text="S3/R2 URL to template package (zip)"
    )
    package_hash = models.CharField(
        _("package hash"),
        max_length=64,
        help_text="SHA256 hash of package"
    )
    version = models.CharField(_("version"), max_length=20, default="1.0.0")

    # Repository
    repository_url = models.URLField(_("repository URL"), blank=True)
    homepage_url = models.URLField(_("homepage URL"), blank=True)
    documentation_url = models.URLField(_("documentation URL"), blank=True)

    # Pricing
    is_free = models.BooleanField(_("is free"), default=True)
    price = models.DecimalField(
        _("price"),
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    currency = models.CharField(
        _("currency"),
        max_length=3,
        default="XAF"
    )

    # Status & moderation
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT
    )
    is_featured = models.BooleanField(_("featured"), default=False)
    is_verified = models.BooleanField(
        _("verified"),
        default=False,
        help_text="Verified by Koraa team"
    )

    # Configuration
    config_schema = models.JSONField(
        _("configuration schema"),
        default=dict,
        blank=True,
        help_text="Customizable options schema"
    )
    default_config = models.JSONField(
        _("default configuration"),
        default=dict,
        blank=True
    )

    # Features
    features = models.JSONField(
        _("features"),
        default=list,
        blank=True,
        help_text="List of template features"
    )
    requirements = models.JSONField(
        _("requirements"),
        default=dict,
        blank=True,
        help_text="Technical requirements (Node version, etc.)"
    )

    # Stats
    downloads = models.PositiveIntegerField(_("downloads"), default=0)
    installations = models.PositiveIntegerField(_("active installations"), default=0)
    rating_average = models.FloatField(
        _("average rating"),
        default=0.0,
        validators=[MinValueValidator(0), MaxValueValidator(5)]
    )
    rating_count = models.PositiveIntegerField(_("rating count"), default=0)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(_("published at"), null=True, blank=True)

    class Meta:
        db_table = "templates"
        verbose_name = _("template")
        verbose_name_plural = _("templates")
        ordering = ["-is_featured", "-rating_average", "-downloads", "-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["category", "status"]),
            models.Index(fields=["-rating_average", "-downloads"]),
        ]

    def __str__(self):
        return f"{self.name} (by {self.author.email})"

    def update_rating(self):
        """Recalculate average rating from reviews."""
        from django.db.models import Avg, Count
        result = self.reviews.aggregate(
            avg_rating=Avg("rating"),
            count=Count("id")
        )
        self.rating_average = result["avg_rating"] or 0.0
        self.rating_count = result["count"] or 0
        self.save(update_fields=["rating_average", "rating_count"])


class TemplateVersion(models.Model):
    """Version history for templates."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(
        Template,
        on_delete=models.CASCADE,
        related_name="versions"
    )
    version = models.CharField(_("version"), max_length=20)
    changelog = models.TextField(_("changelog"))
    package_url = models.URLField(_("package URL"))
    package_hash = models.CharField(_("package hash"), max_length=64)

    # Migration guide (if breaking changes)
    migration_guide = models.TextField(_("migration guide"), blank=True)
    is_breaking_change = models.BooleanField(_("breaking change"), default=False)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "template_versions"
        verbose_name = _("template version")
        verbose_name_plural = _("template versions")
        ordering = ["-created_at"]
        unique_together = [["template", "version"]]

    def __str__(self):
        return f"{self.template.name} v{self.version}"


class TemplatePurchase(models.Model):
    """Record of template purchases."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(
        Template,
        on_delete=models.CASCADE,
        related_name="purchases"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="template_purchases"
    )
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="template_purchases",
        help_text="Store this purchase is for (if applicable)"
    )

    # Payment
    amount_paid = models.DecimalField(
        _("amount paid"),
        max_digits=10,
        decimal_places=2
    )
    currency = models.CharField(_("currency"), max_length=3, default="XAF")
    transaction = models.ForeignKey(
        "payments.PaymentTransaction",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="template_purchases"
    )

    # License
    license_key = models.CharField(
        _("license key"),
        max_length=100,
        unique=True,
        blank=True
    )

    # Metadata
    purchased_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "template_purchases"
        verbose_name = _("template purchase")
        verbose_name_plural = _("template purchases")
        ordering = ["-purchased_at"]
        unique_together = [["template", "user"]]

    def __str__(self):
        return f"{self.user.email} → {self.template.name}"


class TemplateReview(models.Model):
    """User reviews and ratings for templates."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(
        Template,
        on_delete=models.CASCADE,
        related_name="reviews"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="template_reviews"
    )

    # Review
    rating = models.PositiveSmallIntegerField(
        _("rating"),
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    title = models.CharField(_("title"), max_length=200, blank=True)
    comment = models.TextField(_("comment"), blank=True)

    # Store context (which store is this review from?)
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="Store using this template"
    )

    # Moderation
    is_verified_purchase = models.BooleanField(
        _("verified purchase"),
        default=False,
        help_text="User purchased/installed template"
    )
    is_visible = models.BooleanField(_("visible"), default=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "template_reviews"
        verbose_name = _("template review")
        verbose_name_plural = _("template reviews")
        ordering = ["-created_at"]
        unique_together = [["template", "user"]]
        indexes = [
            models.Index(fields=["template", "-created_at"]),
            models.Index(fields=["template", "-rating"]),
        ]

    def __str__(self):
        return f"{self.user.email} → {self.template.name} ({self.rating}★)"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Update template rating
        self.template.update_rating()
