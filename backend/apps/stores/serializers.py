"""Stores serializers."""
from rest_framework import serializers
from .models import Store


class StoreListSerializer(serializers.ModelSerializer):
    """Lightweight representation for lists."""
    storefront_url = serializers.CharField(read_only=True)

    class Meta:
        model = Store
        fields = [
            "id", "name", "slug", "tagline", "logo", "status",
            "currency", "country", "storefront_url", "created_at",
        ]
        read_only_fields = fields


class StoreDetailSerializer(serializers.ModelSerializer):
    """Full representation for detail views."""
    storefront_url = serializers.CharField(read_only=True)
    is_live = serializers.BooleanField(read_only=True)

    class Meta:
        model = Store
        fields = [
            "id", "name", "slug", "tagline", "description",
            "logo", "favicon", "banner",
            "theme", "theme_config",
            "currency", "country", "language",
            "email", "phone", "whatsapp", "instagram", "facebook",
            "custom_domain", "domain_verified",
            "status", "is_live", "published_at",
            "seo_title", "seo_description",
            "storefront_url", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "slug", "domain_verified", "published_at", "created_at", "updated_at"]


class StoreCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = [
            "name", "tagline", "description",
            "currency", "country", "language",
            "email", "phone", "whatsapp",
        ]

    def validate_name(self, value):
        if len(value.strip()) < 2:
            raise serializers.ValidationError("Store name must be at least 2 characters.")
        return value.strip()

    def create(self, validated_data):
        merchant = self.context["request"].user.merchant
        if not merchant.can_create_store:
            raise serializers.ValidationError(
                "You've reached the store limit for your plan. Upgrade to create more stores."
            )
        return Store.objects.create(merchant=merchant, **validated_data)


class StoreUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = [
            "name", "tagline", "description",
            "logo", "favicon", "banner",
            "theme", "theme_config",
            "currency", "country", "language",
            "email", "phone", "whatsapp", "instagram", "facebook",
            "seo_title", "seo_description",
        ]


class StoreSlugCheckSerializer(serializers.Serializer):
    slug = serializers.SlugField()

    def validate_slug(self, value):
        if Store.objects.filter(slug=value).exists():
            raise serializers.ValidationError("This slug is already taken.")
        return value
