"""
Accounts serializers — registration, login, OTP, password reset.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import EmailVerificationOTP, PasswordResetToken

User = get_user_model()


class KoraaTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Custom JWT payload — adds user metadata to the token."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["email"] = user.email
        token["full_name"] = user.full_name
        token["role"] = user.role
        token["is_verified"] = user.is_verified
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserProfileSerializer(self.user).data
        return data


# ─── User serializers ─────────────────────────────────────────────────────────

class UserProfileSerializer(serializers.ModelSerializer):
    """Safe read-only representation of a user."""
    merchant_tier = serializers.SerializerMethodField()
    is_pro = serializers.SerializerMethodField()
    merchant_is_verified = serializers.SerializerMethodField()
    has_merchant = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            "id", "email", "full_name", "phone", "avatar", "avatar_url",
            "role", "is_verified", "date_joined",
            "merchant_tier", "is_pro", "has_merchant", "merchant_is_verified",
            "date_of_birth", "gender", "id_card_number", "city",
        ]
        # `avatar_url` is owned by the identity provider and refreshed on every
        # social sign-in, so it is not the client's to set — it is absent from
        # UserUpdateSerializer for the same reason.
        read_only_fields = ["id", "email", "avatar_url", "role", "is_verified", "date_joined", "merchant_tier", "is_pro", "has_merchant", "merchant_is_verified"]

    def get_has_merchant(self, obj):
        return hasattr(obj, 'merchant')

    def get_merchant_tier(self, obj):
        try:
            return obj.merchant.tier
        except Exception:
            return "free"

    def get_is_pro(self, obj):
        try:
            return obj.merchant.is_pro
        except Exception:
            return False

    def get_merchant_is_verified(self, obj):
        try:
            return obj.merchant.is_verified
        except Exception:
            return False



class UserUpdateSerializer(serializers.ModelSerializer):
    """Allowed user profile updates."""

    class Meta:
        model = User
        fields = ["full_name", "phone", "avatar", "date_of_birth", "gender", "id_card_number", "city"]


# ─── Registration ─────────────────────────────────────────────────────────────

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, required=True, validators=[validate_password]
    )
    password_confirm = serializers.CharField(write_only=True, required=True)
    referral_code = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = User
        fields = ["email", "full_name", "phone", "password", "password_confirm", "referral_code"]

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop("referral_code", None)  # Handled in the view
        user = User.objects.create_user(**validated_data)
        return user


# ─── Email Verification ───────────────────────────────────────────────────────

class OTPRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        try:
            self._user = User.objects.get(email=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("No account found with this email.")
        if self._user.is_verified:
            raise serializers.ValidationError("Email is already verified.")
        return value


class OTPVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(min_length=6, max_length=6)

    def validate(self, attrs):
        try:
            user = User.objects.get(email=attrs["email"])
        except User.DoesNotExist:
            raise serializers.ValidationError({"email": "No account found."})

        otp_obj = (
            EmailVerificationOTP.objects
            .filter(user=user, is_used=False)
            .order_by("-created_at")
            .first()
        )
        if not otp_obj or not otp_obj.verify(attrs["otp"]):
            raise serializers.ValidationError({"otp": "Invalid or expired OTP."})

        attrs["user"] = user
        return attrs


# ─── Password Reset ───────────────────────────────────────────────────────────

class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        # Always return 200 to prevent email enumeration
        return value


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(validators=[validate_password])
    password_confirm = serializers.CharField()

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )
        token_obj = PasswordResetToken.verify_token(attrs["token"])
        if not token_obj:
            raise serializers.ValidationError({"token": "Invalid or expired token."})
        attrs["token_obj"] = token_obj
        return attrs


# ─── Change Password ──────────────────────────────────────────────────────────

class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField(validators=[validate_password])
    new_password_confirm = serializers.CharField()

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError(
                {"current_password": "Current password is incorrect."}
            )
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "Passwords do not match."}
            )
        return attrs

# ─── Social Auth ──────────────────────────────────────────────────────────────

class SocialAuthSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(choices=["google", "apple", "firebase"])
    id_token = serializers.CharField()
    full_name = serializers.CharField(required=False, allow_blank=True)
    referral_code = serializers.CharField(required=False, allow_blank=True)


# ─── Referrals ────────────────────────────────────────────────────────────────

class ReferralSerializer(serializers.ModelSerializer):
    referred_user_email = serializers.CharField(source="referred_user.email", read_only=True)
    referred_user_name = serializers.CharField(source="referred_user.full_name", read_only=True)
    
    class Meta:
        from .models import Referral
        model = Referral
        fields = ["id", "referred_user_email", "referred_user_name", "status", "reward_amount", "created_at"]

