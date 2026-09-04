"""Stores admin."""
from django.contrib import admin

from apps.common.admin_images import ImagePreviewAdminMixin, image_preview

from .models import Store


@admin.register(Store)
class StoreAdmin(ImagePreviewAdminMixin, admin.ModelAdmin):
    logo_preview = image_preview("logo", label="Logo")

    list_display = ("logo_preview", "name", "slug", "merchant", "status", "is_showcased", "currency", "country", "published_at", "created_at")
    list_filter = ("status", "is_showcased", "currency", "country")
    search_fields = ("name", "slug", "merchant__business_name", "custom_domain")
    readonly_fields = ("id", "published_at", "created_at", "updated_at")
    raw_id_fields = ("merchant", "theme")
    actions = ["publish_stores", "suspend_stores"]

    @admin.action(description="Publish selected stores")
    def publish_stores(self, request, queryset):
        for store in queryset:
            store.publish()

    @admin.action(description="Suspend selected stores")
    def suspend_stores(self, request, queryset):
        queryset.update(status=Store.Status.SUSPENDED)
