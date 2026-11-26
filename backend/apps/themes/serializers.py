"""
Themes serializers.
"""

from rest_framework import serializers
from django.contrib.auth import get_user_model

from apps.themes.models import (
    Theme,
    Template,
    TemplateVersion,
    TemplatePurchase,
    TemplateReview,
)

User = get_user_model()


class ThemeSerializer(serializers.ModelSerializer):
    """Serializer for Theme (existing)."""

    class Meta:
        model = Theme
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "category",
            "preview_image",
            "preview_url",
            "config_schema",
            "default_config",
            "is_free",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TemplateAuthorSerializer(serializers.ModelSerializer):
    """Minimal user info for template author."""

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name"]
        read_only_fields = fields


class TemplateListSerializer(serializers.ModelSerializer):
    """Template list view (gallery)."""

    author = TemplateAuthorSerializer(read_only=True)
    is_purchased = serializers.SerializerMethodField()

    class Meta:
        model = Template
        fields = [
            "id",
            "slug",
            "name",
            "description",
            "author",
            "template_type",
            "category",
            "tags",
            "thumbnail",
            "demo_url",
            "is_free",
            "price",
            "currency",
            "is_featured",
            "is_verified",
            "downloads",
            "installations",
            "rating_average",
            "rating_count",
            "is_purchased",
            "created_at",
            "published_at",
        ]
        read_only_fields = fields

    def get_is_purchased(self, obj):
        """Check if current user purchased this template."""
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return TemplatePurchase.objects.filter(
            template=obj,
            user=request.user
        ).exists()


class TemplateDetailSerializer(serializers.ModelSerializer):
    """Template detail view."""

    author = TemplateAuthorSerializer(read_only=True)
    is_purchased = serializers.SerializerMethodField()
    latest_version = serializers.SerializerMethodField()
    review_summary = serializers.SerializerMethodField()

    class Meta:
        model = Template
        fields = [
            "id",
            "slug",
            "name",
            "description",
            "author",
            "template_type",
            "category",
            "tags",
            "thumbnail",
            "screenshots",
            "demo_url",
            "package_url",
            "version",
            "repository_url",
            "homepage_url",
            "documentation_url",
            "is_free",
            "price",
            "currency",
            "status",
            "is_featured",
            "is_verified",
            "config_schema",
            "default_config",
            "features",
            "requirements",
            "downloads",
            "installations",
            "rating_average",
            "rating_count",
            "is_purchased",
            "latest_version",
            "review_summary",
            "created_at",
            "updated_at",
            "published_at",
        ]
        read_only_fields = [
            "id",
            "package_url",
            "downloads",
            "installations",
            "rating_average",
            "rating_count",
            "created_at",
            "updated_at",
            "published_at",
        ]

    def get_is_purchased(self, obj):
        """Check if current user purchased this template."""
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return TemplatePurchase.objects.filter(
            template=obj,
            user=request.user
        ).exists()

    def get_latest_version(self, obj):
        """Get latest version info."""
        latest = obj.versions.first()
        if latest:
            return {
                "version": latest.version,
                "changelog": latest.changelog,
                "created_at": latest.created_at,
            }
        return None

    def get_review_summary(self, obj):
        """Get rating breakdown."""
        from django.db.models import Count, Q

        reviews = obj.reviews.filter(is_visible=True)
        breakdown = {}
        for rating in range(1, 6):
            breakdown[f"rating_{rating}"] = reviews.filter(rating=rating).count()

        return {
            "total": obj.rating_count,
            "average": obj.rating_average,
            "breakdown": breakdown,
        }


class TemplateCreateSerializer(serializers.ModelSerializer):
    """Create/upload template."""

    class Meta:
        model = Template
        fields = [
            "slug",
            "name",
            "description",
            "template_type",
            "category",
            "tags",
            "thumbnail",
            "screenshots",
            "demo_url",
            "package_url",
            "package_hash",
            "version",
            "repository_url",
            "homepage_url",
            "documentation_url",
            "is_free",
            "price",
            "currency",
            "config_schema",
            "default_config",
            "features",
            "requirements",
        ]

    def create(self, validated_data):
        # Set author from request
        validated_data["author"] = self.context["request"].user
        return super().create(validated_data)


class TemplateVersionSerializer(serializers.ModelSerializer):
    """Template version."""

    class Meta:
        model = TemplateVersion
        fields = [
            "id",
            "version",
            "changelog",
            "migration_guide",
            "is_breaking_change",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class TemplatePurchaseSerializer(serializers.ModelSerializer):
    """Template purchase."""

    template = TemplateListSerializer(read_only=True)

    class Meta:
        model = TemplatePurchase
        fields = [
            "id",
            "template",
            "store",
            "amount_paid",
            "currency",
            "license_key",
            "purchased_at",
        ]
        read_only_fields = fields


class TemplateReviewSerializer(serializers.ModelSerializer):
    """Template review."""

    user = TemplateAuthorSerializer(read_only=True)

    class Meta:
        model = TemplateReview
        fields = [
            "id",
            "user",
            "rating",
            "title",
            "comment",
            "is_verified_purchase",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "is_verified_purchase", "created_at", "updated_at"]

    def create(self, validated_data):
        # Set user and template from context
        validated_data["user"] = self.context["request"].user
        validated_data["template"] = self.context["template"]

        # Check if verified purchase
        is_purchased = TemplatePurchase.objects.filter(
            template=validated_data["template"],
            user=validated_data["user"]
        ).exists()
        validated_data["is_verified_purchase"] = is_purchased

        return super().create(validated_data)


class TemplateReviewCreateSerializer(serializers.ModelSerializer):
    """Create template review."""

    class Meta:
        model = TemplateReview
        fields = ["rating", "title", "comment", "store"]

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("Rating must be between 1 and 5")
        return value
