"""Storefront serializers."""

from rest_framework import serializers
from .models import FormSubmission, ServiceForm, StorefrontConfig, StorefrontSection
from apps.stores.models import Store


class StorefrontConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = StorefrontConfig
        fields = [
            "id",
            "primary_color",
            "secondary_color",
            "accent_color",
            "background_color",
            "text_color",
            "font",
            "heading_font",
            "button_style",
            "product_card_style",
            "layout",
            "navigation",
            "footer",
            "announcement_bar",
            "published_at",
            "updated_at",
        ]
        read_only_fields = ["id", "published_at", "updated_at"]


class StorefrontSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = StorefrontSection
        fields = [
            "id",
            "type",
            "order",
            "enabled",
            "settings",
            "updated_at",
        ]
        read_only_fields = ["id", "type", "updated_at"]


class StorefrontSectionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = StorefrontSection
        fields = ["type", "order", "enabled", "settings"]


class SectionReorderSerializer(serializers.Serializer):
    """[{ id: uuid, order: int }, ...]"""
    id = serializers.UUIDField()
    order = serializers.IntegerField(min_value=0)


class SectionReorderListSerializer(serializers.Serializer):
    sections = SectionReorderSerializer(many=True)


# ── Blueprint ──────────────────────────────────────────────────────────────

class BlueprintApplySerializer(serializers.Serializer):
    """A completed run of the guided setup wizard.

    Every field is validated against ``blueprint``'s own catalogue rather
    than against the model's choices. That is stricter on purpose: the
    model would happily accept ``primary_color: "#ff00ff"`` with a pill
    button and a compact grid, but Blueprint's promise is that no set of
    answers produces an ugly storefront, and it can only keep that promise
    if the answers are limited to combinations it curated.
    """

    category = serializers.CharField()
    palette = serializers.CharField()
    pairing = serializers.CharField()
    style_kit = serializers.CharField()
    sections = serializers.ListField(
        child=serializers.CharField(), allow_empty=True
    )

    def _in(self, table, value, label):
        from . import blueprint

        if value not in getattr(blueprint, table):
            raise serializers.ValidationError(
                f"Unknown {label} '{value}'. Fetch /storefront/blueprint/ for the "
                f"current options."
            )
        return value

    def validate_category(self, value):
        return self._in("CATEGORIES", value, "category")

    def validate_palette(self, value):
        return self._in("PALETTES", value, "palette")

    def validate_pairing(self, value):
        return self._in("PAIRINGS", value, "type pairing")

    def validate_style_kit(self, value):
        return self._in("STYLE_KITS", value, "style kit")

    def validate_sections(self, value):
        from . import blueprint

        offerable = blueprint.OFFERABLE_SECTIONS
        unknown = [s for s in value if s not in offerable]
        if unknown:
            raise serializers.ValidationError(
                f"These sections are not offered by Blueprint: {', '.join(unknown)}."
            )
        # Order carries meaning — it becomes the homepage layout — so a
        # repeated type is ambiguous rather than harmless.
        if len(set(value)) != len(value):
            raise serializers.ValidationError("Each section may appear only once.")
        return value


# ── Public serializers (safe — no private data) ────────────────────────────

class PublicStorefrontConfigSerializer(serializers.ModelSerializer):
    """Only returns published_config or live draft. No merchant secrets."""
    store_name = serializers.CharField(source="store.name")
    store_slug = serializers.CharField(source="store.slug")
    store_logo = serializers.SerializerMethodField()
    store_favicon = serializers.SerializerMethodField()

    class Meta:
        model = StorefrontConfig
        fields = [
            "store_name",
            "store_slug",
            "store_logo",
            "store_favicon",
            "primary_color",
            "secondary_color",
            "accent_color",
            "background_color",
            "text_color",
            "font",
            "heading_font",
            "button_style",
            "product_card_style",
            "layout",
            "navigation",
            "footer",
            "announcement_bar",
        ]

    def get_store_logo(self, obj):
        request = self.context.get("request")
        if obj.store.logo and request:
            return request.build_absolute_uri(obj.store.logo.url)
        return None

    def get_store_favicon(self, obj):
        request = self.context.get("request")
        if obj.store.favicon and request:
            return request.build_absolute_uri(obj.store.favicon.url)
        return None


class PublicStorefrontSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = StorefrontSection
        fields = ["id", "type", "order", "enabled", "settings"]


# ── Service enquiry form ──────────────────────────────────────────────────────


class ServiceFormFieldSerializer(serializers.Serializer):
    """One field in a merchant-built form.

    Validated as a nested serializer rather than trusted as raw JSON because a
    field with no key, a duplicate key or a type nothing renders is a form the
    merchant can save and no visitor can submit. Failing here shows them the
    problem in the builder instead.
    """

    key = serializers.RegexField(
        # Used as an object key in the submission payload and as an HTML input
        # name, so it is kept to what is safe in both.
        r"^[a-z][a-z0-9_]{0,39}$",
        error_messages={
            "invalid": "Field names must start with a letter and use only "
                       "lowercase letters, numbers and underscores."
        },
    )
    label = serializers.CharField(max_length=160)
    type = serializers.ChoiceField(
        choices=[t["type"] for t in ServiceForm.FIELD_TYPES]
    )
    required = serializers.BooleanField(required=False, default=False)
    placeholder = serializers.CharField(
        max_length=160, required=False, allow_blank=True, default=""
    )
    help = serializers.CharField(
        max_length=300, required=False, allow_blank=True, default=""
    )
    options = serializers.ListField(
        child=serializers.CharField(max_length=160),
        required=False,
        default=list,
        max_length=30,
    )
    width = serializers.ChoiceField(
        choices=["full", "half"], required=False, default="full"
    )

    def validate(self, attrs):
        needs_options = attrs["type"] in ("select", "radio", "checkboxes")
        options = [o.strip() for o in (attrs.get("options") or []) if o.strip()]
        if needs_options and not options:
            raise serializers.ValidationError(
                {"options": "Give this field at least one option to choose from."}
            )
        attrs["options"] = options if needs_options else []
        return attrs


class ServiceFormSerializer(serializers.ModelSerializer):
    """The form as the merchant's builder reads and writes it.

    ``field_types`` rides along read-only so the builder's palette comes from
    the model rather than from a list written out again in TypeScript — the same
    reason the site-settings screen renders from a schema.
    """

    fields = ServiceFormFieldSerializer(many=True)
    field_types = serializers.SerializerMethodField()
    submission_count = serializers.SerializerMethodField()

    class Meta:
        model = ServiceForm
        fields = [
            "id", "is_enabled", "title", "description", "submit_label",
            "success_message", "fields", "notify_emails", "send_copy_to_sender",
            "field_types", "submission_count", "updated_at",
        ]
        read_only_fields = ["id", "field_types", "submission_count", "updated_at"]

    def get_field_types(self, obj):
        return ServiceForm.FIELD_TYPES

    def get_submission_count(self, obj):
        return obj.submissions.count()

    def validate_fields(self, value):
        if not value:
            raise serializers.ValidationError(
                "A form needs at least one field."
            )
        keys = [f["key"] for f in value]
        duplicates = {k for k in keys if keys.count(k) > 1}
        if duplicates:
            # Two fields with one key means one silently overwrites the other's
            # answer, and the merchant would only find out from a lead that
            # arrived half empty.
            raise serializers.ValidationError(
                f"Field names must be unique — {', '.join(sorted(duplicates))} "
                f"is used more than once."
            )
        if not any(f["type"] == "email" for f in value):
            raise serializers.ValidationError(
                "Include an email field so you can reply to enquiries."
            )
        return value

    def validate_notify_emails(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Expected a list of addresses.")
        cleaned = []
        for address in value:
            address = str(address).strip()
            if not address:
                continue
            field = serializers.EmailField()
            cleaned.append(field.run_validation(address))
        if len(cleaned) > 5:
            raise serializers.ValidationError("Five addresses is the maximum.")
        return cleaned


class PublicServiceFormSerializer(serializers.ModelSerializer):
    """The form as a visitor's browser needs it.

    Notify addresses are absent on purpose: they are the merchant's inbox, and
    publishing them on the storefront hands every scraper a target.
    """

    class Meta:
        model = ServiceForm
        fields = ["title", "description", "submit_label", "success_message", "fields"]


class FormSubmissionSerializer(serializers.ModelSerializer):
    summary = serializers.CharField(read_only=True)

    class Meta:
        model = FormSubmission
        fields = [
            "id", "answers", "summary", "sender_name", "sender_email",
            "sender_phone", "is_read", "emailed_at", "created_at",
        ]
        read_only_fields = [
            "id", "answers", "summary", "sender_name", "sender_email",
            "sender_phone", "emailed_at", "created_at",
        ]

class PublicStorefrontShowcaseSerializer(serializers.ModelSerializer):
    url = serializers.CharField(source='storefront_url', read_only=True)

    class Meta:
        model = Store
        fields = ["id", "name", "slug", "tagline", "logo", "url"]
