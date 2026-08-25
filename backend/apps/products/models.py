"""
Products models.

Architecture:
  Product          — The base product (name, description, category, type)
  ProductVariant   — A specific SKU (size/color combo with its own price/stock)
  ProductImage     — Multiple images per product, ordered
  ProductFile      — Downloadable assets for a digital product
  ProductOption    — Option groups (Size, Color, Material...)
  ProductOptionValue — Option values (S, M, L / Red, Blue...)

Design choices:
- All products are scoped to a Store (tenant isolation)
- Simple products have a single default variant
- Variable products have multiple variants (e.g. Size×Color)
- Price is always stored in the smallest unit for precision
  (but represented in the store's currency decimals for display)
- Digital and service products have no inventory: a file can be sold twice and
  a consultation is not held in a warehouse. ``in_stock`` answers True for them
  regardless of variant rows, and checkout skips the stock draw-down.
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

    # ── Digital delivery ──────────────────────────────────────────────────────
    #
    # Only meaningful when product_type is DIGITAL. A paid order containing this
    # product mints a DownloadGrant (see apps.orders.models) whose limits are
    # copied from here at that moment, so tightening these later cannot retract
    # a link somebody has already bought.
    download_limit = models.PositiveIntegerField(
        _("download limit"),
        default=5,
        help_text="How many times a buyer may download. 0 means unlimited.",
    )
    download_window_days = models.PositiveIntegerField(
        _("download window (days)"),
        default=30,
        help_text="How long the buyer's link stays live. 0 means forever.",
    )

    # ── Service enquiries ─────────────────────────────────────────────────────
    #
    # Only meaningful when product_type is SERVICE. A service is quoted, not
    # added to a basket, so the storefront shows an enquiry button that scrolls
    # to the shop's contact form instead of an add-to-cart control.
    accepts_enquiries = models.BooleanField(
        _("accepts enquiries"),
        default=True,
        help_text="Show an enquiry button instead of add-to-cart on this service.",
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
    def is_digital(self):
        return self.product_type == self.ProductType.DIGITAL

    @property
    def is_service(self):
        return self.product_type == self.ProductType.SERVICE

    @property
    def is_stocked(self):
        """False for anything inventory does not apply to.

        Digital files and services have no units to run out of. Before this,
        both were unsellable: ``in_stock`` summed variant rows a digital product
        never has, so the storefront showed "out of stock" and checkout refused
        the line outright.
        """
        return self.product_type in (
            self.ProductType.SIMPLE,
            self.ProductType.VARIABLE,
        )

    @property
    def in_stock(self):
        """True when total stock across all variants is > 0."""
        if not self.is_stocked:
            return True
        from django.db.models import Sum
        total = self.variants.aggregate(total=Sum("stock_quantity"))["total"] or 0
        return total > 0

    @property
    def low_stock(self):
        """True when total stock is between 1 and 3."""
        if not self.is_stocked:
            return False
        from django.db.models import Sum
        total = self.variants.aggregate(total=Sum("stock_quantity"))["total"] or 0
        return 0 < total <= 3


class ProductFile(models.Model):
    """A downloadable asset behind a digital product.

    A digital product may be several files — a font in three weights, an album,
    a workbook plus its worksheets — so this is a list rather than one field on
    Product. Buyers reach them through a DownloadGrant, never by this path:
    ``upload_to`` lands under MEDIA_ROOT, so anything served straight from a
    media URL is public to whoever guesses the name. The download view reads the
    file and streams it, and nothing links to the raw URL.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="files"
    )
    file = models.FileField(_("file"), upload_to="products/files/%Y/%m/")
    label = models.CharField(
        _("label"), max_length=255, blank=True,
        help_text="What the buyer sees. Defaults to the file name.",
    )
    size_bytes = models.PositiveBigIntegerField(_("size in bytes"), default=0)
    sort_order = models.PositiveIntegerField(_("sort order"), default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "created_at"]
        verbose_name = _("product file")
        verbose_name_plural = _("product files")

    def __str__(self):
        return f"{self.product.name} / {self.display_name}"

    def save(self, *args, **kwargs):
        # Recorded once rather than read from storage on every request: a remote
        # backend charges a round trip for .size, and the download manifest
        # lists every file of every purchase.
        if self.file and not self.size_bytes:
            try:
                self.size_bytes = self.file.size
            except (OSError, ValueError):
                self.size_bytes = 0
        super().save(*args, **kwargs)

    @property
    def display_name(self):
        if self.label:
            return self.label
        return self.file.name.rsplit("/", 1)[-1] if self.file else "file"


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
