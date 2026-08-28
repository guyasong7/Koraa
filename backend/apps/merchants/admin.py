"""Merchants admin."""
from django.contrib import admin
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from apps.common.admin_images import (
    EMPTY,
    ImagePreviewAdminMixin,
    image_preview,
    thumbnail_html,
)

from .models import Merchant, MerchantIdentity, MerchantStaff, MerchantPayoutAccount


@admin.register(Merchant)
class MerchantAdmin(ImagePreviewAdminMixin, admin.ModelAdmin):
    logo_preview = image_preview("logo", label="Logo")

    list_display = ("logo_preview", "business_name", "user", "business_type", "tier", "is_verified", "country", "created_at")
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
class MerchantIdentityAdmin(ImagePreviewAdminMixin, admin.ModelAdmin):
    # The question this page exists to answer is whether the face on the ID is
    # the face in the selfie. Answering it needs both on screen at once, and the
    # admin stacks fields vertically — so the documents also get one readonly row
    # that puts them side by side, above the upload controls that can replace
    # them.
    selfie_preview = image_preview("selfie_with_id", label="Selfie with ID", max_side=32)

    @admin.display(description="Documents, side by side")
    def document_row(self, obj):
        """The three identity documents in one row, each linked to full size."""
        cells = []
        for field_name, caption in (
            ("id_document", "ID front"),
            ("id_document_back", "ID back"),
            ("selfie_with_id", "Selfie with ID"),
            ("business_document", "Business document"),
        ):
            thumb = thumbnail_html(
                getattr(obj, field_name, None), max_side=260, require_image_suffix=True
            )
            if not thumb:
                # Either nothing uploaded, or a PDF — which the upload control
                # below still links to. Saying so beats an unexplained gap.
                continue
            cells.append(
                format_html(
                    '<figure style="margin:0;text-align:center;">{}'
                    '<figcaption style="font-size:11px;color:#666;margin-top:4px;">'
                    "{}</figcaption></figure>",
                    thumb,
                    caption,
                )
            )
        if not cells:
            return EMPTY
        return format_html(
            '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;">'
            "{}</div>",
            mark_safe("".join(cells)),
        )

    list_display = ("selfie_preview", "merchant", "verification_status", "id_document_verified", "created_at")
    list_editable = ("verification_status", "id_document_verified")
    list_filter = ("verification_status", "id_document_verified", "location_verified", "phone_verified")
    search_fields = ("merchant__business_name", "first_name", "last_name", "document_number")
    readonly_fields = ("id", "document_row", "face_match_status", "face_match_score", "created_at", "updated_at")
    raw_id_fields = ("merchant",)

    fieldsets = (
        ("Review", {
            "fields": ("document_row", "verification_status", "id_document_verified", "business_document_verified"),
        }),
        ("Merchant", {"fields": ("id", "merchant")}),
        ("Identity as read from the document", {
            # Populated by Didit, not by hand — but left editable, because a
            # reviewer correcting a mis-OCR'd name is the reason to be here.
            "fields": ("first_name", "last_name", "document_type", "document_number"),
        }),
        ("Uploads", {
            "classes": ("collapse",),
            "fields": ("id_document", "id_document_back", "selfie_with_id", "business_document"),
        }),
        ("Other verifications", {"fields": ("location_verified", "phone_verified")}),
        ("Didit", {
            "classes": ("collapse",),
            "fields": ("didit_request_id", "face_match_status", "face_match_score", "warnings"),
        }),
        ("Metadata", {"classes": ("collapse",), "fields": ("created_at", "updated_at")}),
    )
