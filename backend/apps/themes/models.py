"""
Themes models.

A Theme is a professionally designed storefront template.
Themes are platform-managed (created by Koraa team, not merchants).
Merchants choose a theme and can customize colors, fonts, section order via
Store.theme_config (a JSON field).
"""

import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _


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
