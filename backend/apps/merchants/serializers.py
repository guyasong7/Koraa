from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Merchant, MerchantIdentity, MerchantStaff, MerchantPayoutAccount

User = get_user_model()

class MerchantIdentitySerializer(serializers.ModelSerializer):
    class Meta:
        model = MerchantIdentity
        fields = [
            "location_verified", "phone_verified",
            "id_document", "id_document_back", "selfie_with_id", "id_document_verified",
            "business_document", "business_document_verified",
            "didit_request_id", "verification_status", "first_name",
            "last_name", "document_type", "document_number", "warnings",
            "face_match_status", "face_match_score",
        ]
        read_only_fields = [
            "location_verified", "phone_verified",
            "id_document_verified", "business_document_verified",
            "didit_request_id", "verification_status", "first_name",
            "last_name", "document_type", "document_number", "warnings",
            "face_match_status", "face_match_score",
        ]


class MerchantSerializer(serializers.ModelSerializer):
    store_count = serializers.IntegerField(read_only=True)
    is_pro = serializers.BooleanField(read_only=True)
    identity = MerchantIdentitySerializer(read_only=True)

    class Meta:
        model = Merchant
        fields = [
            "id", "business_name", "business_type", "description",
            "logo", "banner", "email", "phone", "whatsapp",
            "country", "city", "address", "tier", "tier_expires_at",
            "is_verified", "is_pro", "store_count", "created_at", "updated_at",
            "identity", "referral_code"
        ]
        read_only_fields = ["id", "tier", "tier_expires_at", "is_verified", "created_at", "updated_at", "referral_code"]


class MerchantStaffSerializer(serializers.ModelSerializer):
    """A team membership, from either side of the invite.

    The owner reads this list to see who is on which shop; a teammate reads
    their own rows to see which shops were shared with them. Both need the
    store named, so ``store_name`` and ``merchant_name`` are here rather than
    left for the client to join by id.
    """

    email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    store_name = serializers.SerializerMethodField()
    merchant_name = serializers.CharField(source="merchant.business_name", read_only=True)

    class Meta:
        model = MerchantStaff
        fields = [
            "id", "user", "email", "full_name", "role", "status",
            "store", "store_name", "merchant_name", "created_at",
        ]
        read_only_fields = [
            "id", "user", "email", "full_name", "status",
            "store", "store_name", "merchant_name", "created_at",
        ]

    def get_store_name(self, obj) -> str:
        """The shared store's name, or a note that the row predates per-store invites."""
        return obj.store.name if obj.store_id else "All stores (legacy)"


class MerchantCreateSerializer(serializers.ModelSerializer):
    """Used during onboarding to create the merchant profile."""

    class Meta:
        model = Merchant
        fields = [
            "business_name", "business_type", "description",
            "email", "phone", "whatsapp", "country", "city", "address",
        ]

    def create(self, validated_data):
        user = self.context["request"].user
        # Prevent duplicate merchant profiles
        if hasattr(user, "merchant"):
            raise serializers.ValidationError("You already have a merchant profile.")
        return Merchant.objects.create(user=user, **validated_data)


class MerchantUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Merchant
        fields = [
            "business_name", "business_type", "description",
            "logo", "banner", "email", "phone", "whatsapp",
            "country", "city", "address",
        ]

class MerchantPayoutAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = MerchantPayoutAccount
        fields = ["id", "provider", "name", "phone", "is_default", "created_at"]
        read_only_fields = ["id", "created_at"]

