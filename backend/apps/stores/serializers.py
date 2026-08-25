"""Stores serializers."""
from rest_framework import serializers

from apps.merchants.models import MerchantStaff
from apps.merchants.utils_helpers import require_own_merchant

from .models import Store
from . import site_settings


class StoreAccessMixin:
    """Resolves the caller's relationship to each store.

    The stores list mixes shops the caller owns with shops shared with them,
    and the two are not interchangeable — only the owner can take a store
    down or invite more people. Without these fields the dashboard has no way
    to tell them apart, so it would either hide owner-only buttons from
    owners or offer them to teammates who get a 403 on click.

    Only the ``get_*`` methods live here. The matching SerializerMethodFields
    are declared on each serializer: DRF collects fields through its
    metaclass, which reads ``_declared_fields`` off the bases, and a plain
    mixin has none — fields declared here would be silently dropped.
    """

    def _caller(self):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return user if user is not None and user.is_authenticated else None

    def _roles(self):
        """The caller's accepted memberships, as ``(by store, by merchant)``.

        Fetched once and cached on the serializer rather than per store:
        ``many=True`` reuses a single child instance, so this stays one query
        for a list of any length.
        """
        if not hasattr(self, "_role_cache"):
            by_store, by_merchant = {}, {}
            user = self._caller()
            if user is not None:
                rows = MerchantStaff.objects.filter(
                    user=user, status=MerchantStaff.Status.ACCEPTED
                )
                for row in rows:
                    if row.store_id:
                        by_store[row.store_id] = row.role
                    else:  # legacy account-wide invite
                        by_merchant[row.merchant_id] = row.role
            self._role_cache = (by_store, by_merchant)
        return self._role_cache

    def get_is_owner(self, obj) -> bool:
        user = self._caller()
        own = getattr(user, "merchant", None) if user is not None else None
        return own is not None and obj.merchant_id == own.id

    def get_access_role(self, obj) -> str:
        """"owner", or the role label the owner gave this teammate."""
        if self.get_is_owner(obj):
            return "owner"
        by_store, by_merchant = self._roles()
        return by_store.get(obj.id) or by_merchant.get(obj.merchant_id) or ""

    def get_shared_by(self, obj) -> str:
        """The owner's business name, on stores the caller does not own."""
        if self.get_is_owner(obj):
            return ""
        return obj.merchant.business_name if obj.merchant_id else ""


class StoreListSerializer(StoreAccessMixin, serializers.ModelSerializer):
    """Lightweight representation for lists."""
    storefront_url = serializers.CharField(read_only=True)
    is_owner = serializers.SerializerMethodField()
    access_role = serializers.SerializerMethodField()
    shared_by = serializers.SerializerMethodField()

    class Meta:
        model = Store
        fields = [
            "id", "name", "slug", "tagline", "logo", "status",
            "currency", "country", "storefront_url", "created_at",
            "is_owner", "access_role", "shared_by",
        ]
        read_only_fields = fields


class StoreDetailSerializer(StoreAccessMixin, serializers.ModelSerializer):
    """Full representation for detail views."""
    storefront_url = serializers.CharField(read_only=True)
    is_live = serializers.BooleanField(read_only=True)
    is_owner = serializers.SerializerMethodField()
    access_role = serializers.SerializerMethodField()
    shared_by = serializers.SerializerMethodField()

    class Meta:
        model = Store
        fields = [
            "id", "name", "slug", "tagline", "description",
            "logo", "favicon", "banner", "social_image",
            "theme", "theme_config",
            "currency", "country", "language",
            "email", "phone", "whatsapp", "instagram", "facebook",
            "custom_domain", "domain_verified",
            "status", "is_live", "published_at",
            "seo_title", "seo_description",
            "storefront_url", "created_at", "updated_at",
            "is_owner", "access_role", "shared_by",
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
        # The caller's own account, never an employer's — see
        # StoreListCreateView.create.
        merchant = require_own_merchant(self.context["request"].user)
        if not merchant.can_create_store:
            raise serializers.ValidationError(
                "You've reached the store limit for your plan. Upgrade to create more stores."
            )
        store = Store.objects.create(merchant=merchant, **validated_data)

        # Auto-create storefront config + default sections
        from apps.storefront.models import StorefrontConfig, create_default_sections
        StorefrontConfig.objects.get_or_create(store=store)
        create_default_sections(store)

        return store


class StoreUpdateSerializer(serializers.ModelSerializer):
    """Editable store columns.

    ``site_settings`` is deliberately absent: it is a JSON blob with a schema,
    and a plain ModelSerializer field would let a client replace the whole thing
    with anything at all. It has its own endpoint, which validates key by key
    against ``apps.stores.site_settings``.
    """

    class Meta:
        model = Store
        fields = [
            "name", "tagline", "description",
            "logo", "favicon", "banner", "social_image",
            "theme", "theme_config",
            "currency", "country", "language",
            "email", "phone", "whatsapp", "instagram", "facebook",
            "seo_title", "seo_description",
        ]


class StoreSiteSettingsSerializer(serializers.Serializer):
    """A partial update to a store's site settings.

    Free-form on the way in and validated by the schema module rather than by
    declared DRF fields, because the schema is the thing the dashboard also
    renders from — declaring forty fields here would be the same list a second
    time, and the two would drift.
    """

    settings = serializers.DictField(required=True)

    def validate_settings(self, value):
        return site_settings.validate_patch(value)


class StoreSlugCheckSerializer(serializers.Serializer):
    slug = serializers.SlugField()

    def validate_slug(self, value):
        if Store.objects.filter(slug=value).exists():
            raise serializers.ValidationError("This slug is already taken.")
        return value
