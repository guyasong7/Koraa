"""
Products models.

Architecture:
  Product          — The base product (name, description, category, type)
  ProductVariant   — A specific SKU (size/color combo with its own price/stock)
  ProductImage     — Multiple images per product, ordered
  ProductOption    — Option groups (Size, Color, Material...)
  ProductOptionValue — Option values (S, M, L / Red, Blue...)

Design choices:
- All products are scoped to a Store (tenant isolation)
- Simple products have a single default variant
- Variable products have multiple variants (e.g. Size×Color)
- Price is always stored in the smallest unit for precision
  (but represented in the store's currency decimals for display)
"""

import uuid
from decimal import Decimal
from django.db import models
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _
from django.core.validators import MinValueValidator


class Product(models.Model):
    """Base product definition."""

    class Status(models.TextChoices):
        DRAFT = "draft", _("Draft")
        ACTIVE = "active", _("Active")
        ARCHIVED = "archived", _("Archived")

    class ProductType(models.TextChoices):
        SIMPLE = "simple", _("Simple (no variants)")
        VARIABLE = "variable", _("Variable (has variants)")
        DIGITAL = "digital", _("Digital product")
        SERVICE = "service", _("Service")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(
        "stores.Store", on_delete=models.CASCADE, related_name="products"
    )
    category = models.ForeignKey(
        "categories.Category",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products",
    )

    # Identity
    name = models.CharField(_("name"), max_length=255)
    slug = models.SlugField(_("slug"), max_length=255)
    description = models.TextField(_("description"), blank=True)
    short_description = models.CharField(_("short description"), max_length=500, blank=True)
    product_type = models.CharField(
        _("type"), max_length=20, choices=ProductType.choices, default=ProductType.SIMPLE
    )

    # Pricing (base — variants override)
    base_price = models.DecimalField(
        _("base price"), max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0"))]
    )
    compare_at_price = models.DecimalField(
        _("compare-at price"), max_digits=12, decimal_places=2,
        null=True, blank=True, validators=[MinValueValidator(Decimal("0"))],
        help_text="Original price for showing a discount",
    )

    # Status & visibility
    status = models.CharField(
        _("status"), max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True
    )
    is_featured = models.BooleanField(_("featured"), default=False)

    # SEO
    seo_title = models.CharField(_("SEO title"), max_length=70, blank=True)
    seo_description = models.CharField(_("SEO description"), max_length=160, blank=True)

    # Physical properties (for shipping)
    weight = models.DecimalField(
        _("weight (kg)"), max_digits=8, decimal_places=3, null=True, blank=True
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("product")
        verbose_name_plural = _("products")
        ordering = ["-created_at"]
        unique_together = [("store", "slug")]
        indexes = [
            models.Index(fields=["store", "status"]),
            models.Index(fields=["store", "category"]),
            models.Index(fields=["store", "is_featured"]),
        ]

    def __str__(self):
        return f"{self.store.name} / {self.name}"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = self._generate_unique_slug()
        super().save(*args, **kwargs)

    def _generate_unique_slug(self):
        base_slug = slugify(self.name)[:200]
        slug = base_slug
        counter = 1
        while Product.objects.filter(store=self.store, slug=slug).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1
        return slug

    @property
    def is_on_sale(self):
        return bool(
            self.compare_at_price and self.compare_at_price > self.base_price
        )

    @property
    def primary_image(self):
        return self.images.filter(is_primary=True).first() or self.images.first()

    @property
    def in_stock(self):
        return self.variants.filter(stock_quantity__gt=0).exists()


class ProductImage(models.Model):
    """Ordered image gallery for a product."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(_("image"), upload_to="products/images/")
    alt_text = models.CharField(_("alt text"), max_length=255, blank=True)
    sort_order = models.PositiveIntegerField(_("sort order"), default=0)
    is_primary = models.BooleanField(_("primary image"), default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "created_at"]
        verbose_name = _("product image")

    def save(self, *args, **kwargs):
        # Ensure only one primary image per product
        if self.is_primary:
            ProductImage.objects.filter(product=self.product, is_primary=True).update(is_primary=False)
        super().save(*args, **kwargs)


class ProductOption(models.Model):
    """
    An option group for a variable product.
    Example: "Size", "Color", "Material"
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="options")
    name = models.CharField(_("option name"), max_length=100)
    sort_order = models.PositiveIntegerField(_("sort order"), default=0)

    class Meta:
        ordering = ["sort_order"]
        unique_together = [("product", "name")]

    def __str__(self):
        return f"{self.product.name} / {self.name}"


class ProductOptionValue(models.Model):
    """A value within an option group. Example: "Red", "Blue" within "Color"."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    option = models.ForeignKey(ProductOption, on_delete=models.CASCADE, related_name="values")
    value = models.CharField(_("value"), max_length=100)
    sort_order = models.PositiveIntegerField(_("sort order"), default=0)

    class Meta:
        ordering = ["sort_order"]
        unique_together = [("option", "value")]

    def __str__(self):
        return f"{self.option.name}: {self.value}"


class ProductVariant(models.Model):
    """
    A specific purchasable SKU.
    For simple products: one default variant.
    For variable products: one per combination of option values.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    option_values = models.ManyToManyField(
        ProductOptionValue, blank=True, related_name="variants"
    )

    # Pricing (overrides product base_price if set)
    price = models.DecimalField(
        _("price"), max_digits=12, decimal_places=2,
        null=True, blank=True, validators=[MinValueValidator(Decimal("0"))],
        help_text="Leave blank to inherit from product base_price",
    )
    compare_at_price = models.DecimalField(
        _("compare-at price"), max_digits=12, decimal_places=2,
        null=True, blank=True,
    )

    # Inventory
    sku = models.CharField(_("SKU"), max_length=100, blank=True, db_index=True)
    barcode = models.CharField(_("barcode"), max_length=100, blank=True)
    stock_quantity = models.IntegerField(_("stock quantity"), default=0)
    track_inventory = models.BooleanField(_("track inventory"), default=True)
    allow_backorder = models.BooleanField(_("allow backorder"), default=False)

    # Physical
    weight = models.DecimalField(
        _("weight (kg)"), max_digits=8, decimal_places=3, null=True, blank=True
    )
    image = models.ForeignKey(
        ProductImage,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="variants",
    )

    is_default = models.BooleanField(_("default variant"), default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("product variant")
        ordering = ["created_at"]

    def __str__(self):
        if self.option_values.exists():
            vals = " / ".join(v.value for v in self.option_values.all())
            return f"{self.product.name} — {vals}"
        return f"{self.product.name} (default)"

    @property
    def effective_price(self):
        return self.price if self.price is not None else self.product.base_price

    @property
    def is_in_stock(self):
        if not self.track_inventory:
            return True
        return self.stock_quantity > 0 or self.allow_backorder
