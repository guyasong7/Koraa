"""Merchants serializers."""
from rest_framework import serializers
from .models import Merchant, MerchantIdentity

class MerchantIdentitySerializer(serializers.ModelSerializer):
    class Meta:
        model = MerchantIdentity
        fields = [
            "location_verified", "phone_verified",
            "id_document", "id_document_verified",
            "business_document", "business_document_verified"
        ]
        read_only_fields = [
            "location_verified", "phone_verified",
            "id_document_verified", "business_document_verified"
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
            "identity"
        ]
        read_only_fields = ["id", "tier", "tier_expires_at", "is_verified", "created_at", "updated_at"]


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
