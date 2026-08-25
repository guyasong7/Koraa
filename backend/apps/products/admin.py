from django.contrib import admin
from .models import Product, ProductImage, ProductVariant, ProductOption, ProductOptionValue

class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1

class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 1

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "store", "product_type", "base_price", "status", "is_featured", "created_at")
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
