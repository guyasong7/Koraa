"""Merchants admin."""
from django.contrib import admin
from .models import Merchant, MerchantIdentity, MerchantStaff, MerchantPayoutAccount


@admin.register(Merchant)
class MerchantAdmin(admin.ModelAdmin):
    list_display = ("business_name", "user", "business_type", "tier", "is_verified", "country", "created_at")
    list_editable = ("tier", "is_verified")
    list_filter = ("business_type", "tier", "is_verified", "country")
    search_fields = ("business_name", "user__email", "phone")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("user",)

    fieldsets = (
        ("Business Identity", {
            "fields": ("id", "user", "business_name", "business_type", "description", "logo", "banner")
        }),
        ("Subscription & Plan", {
            "fields": ("tier", "tier_expires_at"),
            "classes": ("wide", "extrapretty"),
        }),
        ("Contact & Location", {
            "fields": ("email", "phone", "whatsapp", "country", "city", "address")
        }),
        ("Verification & Metadata", {
            "fields": ("is_verified", "created_at", "updated_at")
        }),
    )

@admin.register(MerchantIdentity)
class MerchantIdentityAdmin(admin.ModelAdmin):
    list_display = ("merchant", "verification_status", "id_document_verified", "created_at")
    list_editable = ("verification_status", "id_document_verified")
    list_filter = ("verification_status", "id_document_verified", "location_verified", "phone_verified")
    search_fields = ("merchant__business_name", "first_name", "last_name", "document_number")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("merchant",)
