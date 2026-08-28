from django.contrib import admin

from apps.common.admin_images import (
    EMPTY,
    ImagePreviewAdminMixin,
    image_preview,
    thumbnail_html,
)

from .models import Product, ProductImage, ProductVariant, ProductOption, ProductOptionValue

class ProductImageInline(ImagePreviewAdminMixin, admin.TabularInline):
    model = ProductImage
    extra = 1
    # Shown alongside the upload control, so reordering a gallery or picking
    # the primary image does not mean opening each file to see which is which.
    image_thumb = image_preview("image", label="Preview", max_side=80)
    readonly_fields = ("image_thumb",)

class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 1

@admin.register(Product)
class ProductAdmin(ImagePreviewAdminMixin, admin.ModelAdmin):
    @admin.display(description="")
    def primary_image(self, obj):
        """The image a storefront would lead with, for the changelist.

        Falls back to the first by sort order when nothing is flagged primary,
        which matches what the storefront serialiser does — a product with
        images but no primary is not a product with no images.
        """
        image = obj.images.filter(is_primary=True).first() or obj.images.first()
        return thumbnail_html(image.image, max_side=48) or EMPTY if image else EMPTY

    list_display = ("primary_image", "name", "store", "product_type", "base_price", "status", "is_featured", "created_at")
    list_filter = ("status", "product_type", "is_featured", "store")
    search_fields = ("name", "slug", "description")
    inlines = [ProductImageInline, ProductVariantInline]
    prepopulated_fields = {"slug": ("name",)}

@admin.register(ProductOption)
class ProductOptionAdmin(admin.ModelAdmin):
    list_display = ("name", "product", "sort_order")

@admin.register(ProductOptionValue)
class ProductOptionValueAdmin(admin.ModelAdmin):
    list_display = ("value", "option", "sort_order")
