"""Merchants admin."""
from django.contrib import admin
from .models import Merchant


@admin.register(Merchant)
class MerchantAdmin(admin.ModelAdmin):
    list_display = ("business_name", "user", "business_type", "tier", "is_verified", "country", "created_at")
    list_filter = ("business_type", "tier", "is_verified", "country")
    search_fields = ("business_name", "user__email", "phone")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("user",)
