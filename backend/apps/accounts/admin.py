"""Accounts admin — register custom User model."""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _

from apps.common.admin_images import ImagePreviewAdminMixin, image_preview

from .models import User, EmailVerificationOTP, PasswordResetToken


from apps.merchants.models import Merchant

class MerchantInline(admin.StackedInline):
    model = Merchant
    can_delete = False
    verbose_name_plural = _("Merchant Profile & Subscription")
    fk_name = "user"
    fields = ("business_name", "business_type", "tier", "tier_expires_at", "is_verified")

@admin.register(User)
class UserAdmin(ImagePreviewAdminMixin, BaseUserAdmin):
    avatar_preview = image_preview("avatar", label="", max_side=32)

    list_display = ("avatar_preview", "email", "full_name", "role", "is_verified", "is_active", "date_joined")
    list_filter = ("role", "is_verified", "is_active", "is_staff")
    search_fields = ("email", "full_name", "phone")
    ordering = ("-date_joined",)
    readonly_fields = ("id", "date_joined", "last_login_ip")
    inlines = [MerchantInline]

    fieldsets = (
        (None, {"fields": ("id", "email", "password")}),
        (_("Personal info"), {"fields": ("full_name", "phone", "avatar")}),
        (_("Permissions"), {"fields": ("role", "is_active", "is_staff", "is_superuser", "is_verified", "groups", "user_permissions")}),
        (_("Metadata"), {"fields": ("date_joined", "last_login_ip")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "full_name", "password1", "password2", "role"),
        }),
    )


@admin.register(EmailVerificationOTP)
class EmailVerificationOTPAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at", "expires_at", "is_used")
    list_filter = ("is_used",)
    readonly_fields = ("otp_hash", "created_at")


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at", "expires_at", "is_used")
    list_filter = ("is_used",)
    readonly_fields = ("token_hash", "created_at")
