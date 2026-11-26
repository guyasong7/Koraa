"""
Themes admin.
"""

from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.utils.safestring import mark_safe

from apps.themes.models import (
    Theme,
    Template,
    TemplateVersion,
    TemplatePurchase,
    TemplateReview,
)


@admin.register(Theme)
class ThemeAdmin(admin.ModelAdmin):
    """Admin for platform themes."""

    list_display = [
        "name",
        "slug",
        "category",
        "is_free",
        "is_active",
        "sort_order",
        "created_at",
    ]
    list_filter = ["category", "is_free", "is_active"]
    search_fields = ["name", "slug", "description"]
    prepopulated_fields = {"slug": ["name"]}
    ordering = ["sort_order", "name"]


class TemplateVersionInline(admin.TabularInline):
    """Inline for template versions."""

    model = TemplateVersion
    extra = 0
    fields = ["version", "changelog", "is_breaking_change", "created_at"]
    readonly_fields = ["created_at"]
    ordering = ["-created_at"]


@admin.register(Template)
class TemplateAdmin(admin.ModelAdmin):
    """Admin for custom templates."""

    list_display = [
        "name",
        "slug",
        "author_link",
        "template_type",
        "category",
        "status",
        "price_display",
        "rating_display",
        "downloads",
        "installations",
        "is_featured",
        "is_verified",
        "created_at",
    ]
    list_filter = [
        "status",
        "template_type",
        "category",
        "is_free",
        "is_featured",
        "is_verified",
        "created_at",
    ]
    search_fields = ["name", "slug", "description", "author__email"]
    prepopulated_fields = {"slug": ["name"]}
    readonly_fields = [
        "id",
        "downloads",
        "installations",
        "rating_average",
        "rating_count",
        "created_at",
        "updated_at",
        "thumbnail_preview",
        "author_link",
    ]
    fieldsets = (
        ("Basic Info", {
            "fields": (
                "id",
                "slug",
                "name",
                "description",
                "author_link",
            )
        }),
        ("Classification", {
            "fields": (
                "template_type",
                "category",
                "tags",
            )
        }),
        ("Media", {
            "fields": (
                "thumbnail",
                "thumbnail_preview",
                "screenshots",
                "demo_url",
            )
        }),
        ("Package", {
            "fields": (
                "package_url",
                "package_hash",
                "version",
                "repository_url",
                "homepage_url",
                "documentation_url",
            )
        }),
        ("Pricing", {
            "fields": (
                "is_free",
                "price",
                "currency",
            )
        }),
        ("Status", {
            "fields": (
                "status",
                "is_featured",
                "is_verified",
            )
        }),
        ("Configuration", {
            "fields": (
                "config_schema",
                "default_config",
                "features",
                "requirements",
            ),
            "classes": ["collapse"],
        }),
        ("Stats", {
            "fields": (
                "downloads",
                "installations",
                "rating_average",
                "rating_count",
            )
        }),
        ("Timestamps", {
            "fields": (
                "created_at",
                "updated_at",
                "published_at",
            )
        }),
    )
    inlines = [TemplateVersionInline]
    actions = ["approve_templates", "feature_templates", "verify_templates"]

    def author_link(self, obj):
        """Link to author."""
        url = reverse("admin:accounts_user_change", args=[obj.author.pk])
        return format_html('<a href="{}">{}</a>', url, obj.author.email)
    author_link.short_description = "Author"

    def price_display(self, obj):
        """Display price."""
        if obj.is_free:
            return format_html('<span style="color: green;">FREE</span>')
        return f"{obj.price} {obj.currency}"
    price_display.short_description = "Price"

    def rating_display(self, obj):
        """Display rating."""
        if obj.rating_count == 0:
            return "—"
        stars = "★" * int(obj.rating_average) + "☆" * (5 - int(obj.rating_average))
        return format_html(
            '<span title="{:.1f} ({} reviews)">{}</span>',
            obj.rating_average,
            obj.rating_count,
            stars
        )
    rating_display.short_description = "Rating"

    def thumbnail_preview(self, obj):
        """Preview thumbnail."""
        if obj.thumbnail:
            return format_html(
                '<img src="{}" style="max-width: 300px; max-height: 200px;" />',
                obj.thumbnail.url
            )
        return "—"
    thumbnail_preview.short_description = "Thumbnail Preview"

    def approve_templates(self, request, queryset):
        """Approve selected templates."""
        from django.utils import timezone

        updated = queryset.update(
            status=Template.Status.APPROVED,
            published_at=timezone.now()
        )
        self.message_user(request, f"{updated} template(s) approved.")
    approve_templates.short_description = "Approve selected templates"

    def feature_templates(self, request, queryset):
        """Feature selected templates."""
        updated = queryset.update(is_featured=True)
        self.message_user(request, f"{updated} template(s) featured.")
    feature_templates.short_description = "Feature selected templates"

    def verify_templates(self, request, queryset):
        """Verify selected templates."""
        updated = queryset.update(is_verified=True)
        self.message_user(request, f"{updated} template(s) verified.")
    verify_templates.short_description = "Verify selected templates"


@admin.register(TemplateVersion)
class TemplateVersionAdmin(admin.ModelAdmin):
    """Admin for template versions."""

    list_display = [
        "template",
        "version",
        "is_breaking_change",
        "created_at",
    ]
    list_filter = ["is_breaking_change", "created_at"]
    search_fields = ["template__name", "version", "changelog"]
    readonly_fields = ["id", "created_at"]
    ordering = ["-created_at"]


@admin.register(TemplatePurchase)
class TemplatePurchaseAdmin(admin.ModelAdmin):
    """Admin for template purchases."""

    list_display = [
        "user_link",
        "template_link",
        "amount_paid",
        "currency",
        "store_link",
        "purchased_at",
    ]
    list_filter = ["currency", "purchased_at"]
    search_fields = [
        "user__email",
        "template__name",
        "license_key",
    ]
    readonly_fields = [
        "id",
        "user_link",
        "template_link",
        "store_link",
        "purchased_at",
    ]
    ordering = ["-purchased_at"]

    def user_link(self, obj):
        """Link to user."""
        url = reverse("admin:accounts_user_change", args=[obj.user.pk])
        return format_html('<a href="{}">{}</a>', url, obj.user.email)
    user_link.short_description = "User"

    def template_link(self, obj):
        """Link to template."""
        url = reverse("admin:themes_template_change", args=[obj.template.pk])
        return format_html('<a href="{}">{}</a>', url, obj.template.name)
    template_link.short_description = "Template"

    def store_link(self, obj):
        """Link to store."""
        if obj.store:
            url = reverse("admin:stores_store_change", args=[obj.store.pk])
            return format_html('<a href="{}">{}</a>', url, obj.store.name)
        return "—"
    store_link.short_description = "Store"


@admin.register(TemplateReview)
class TemplateReviewAdmin(admin.ModelAdmin):
    """Admin for template reviews."""

    list_display = [
        "user_link",
        "template_link",
        "rating_display",
        "is_verified_purchase",
        "is_visible",
        "created_at",
    ]
    list_filter = [
        "rating",
        "is_verified_purchase",
        "is_visible",
        "created_at",
    ]
    search_fields = [
        "user__email",
        "template__name",
        "title",
        "comment",
    ]
    readonly_fields = [
        "id",
        "user_link",
        "template_link",
        "is_verified_purchase",
        "created_at",
        "updated_at",
    ]
    ordering = ["-created_at"]
    actions = ["hide_reviews", "show_reviews"]

    def user_link(self, obj):
        """Link to user."""
        url = reverse("admin:accounts_user_change", args=[obj.user.pk])
        return format_html('<a href="{}">{}</a>', url, obj.user.email)
    user_link.short_description = "User"

    def template_link(self, obj):
        """Link to template."""
        url = reverse("admin:themes_template_change", args=[obj.template.pk])
        return format_html('<a href="{}">{}</a>', url, obj.template.name)
    template_link.short_description = "Template"

    def rating_display(self, obj):
        """Display rating stars."""
        stars = "★" * obj.rating + "☆" * (5 - obj.rating)
        return stars
    rating_display.short_description = "Rating"

    def hide_reviews(self, request, queryset):
        """Hide selected reviews."""
        updated = queryset.update(is_visible=False)
        self.message_user(request, f"{updated} review(s) hidden.")
    hide_reviews.short_description = "Hide selected reviews"

    def show_reviews(self, request, queryset):
        """Show selected reviews."""
        updated = queryset.update(is_visible=True)
        self.message_user(request, f"{updated} review(s) shown.")
    show_reviews.short_description = "Show selected reviews"
