"""
Accounts views — Auth endpoints.

Endpoints:
  POST /auth/register/              — Create account
  POST /auth/login/                 — JWT token pair
  POST /auth/token/refresh/         — Refresh access token
  POST /auth/logout/                — Blacklist refresh token
  POST /auth/verify-email/request/  — Send OTP
  POST /auth/verify-email/confirm/  — Verify OTP
  POST /auth/password-reset/request/ — Send reset email
  POST /auth/password-reset/confirm/ — Reset password with token
  POST /auth/change-password/        — Change password (authenticated)
  GET  /auth/me/                    — Current user profile
  PATCH /auth/me/                   — Update profile
"""

from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.conf import settings
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema, OpenApiResponse

from .models import EmailVerificationOTP, PasswordResetToken
from .serializers import (
    KoraaTokenObtainPairSerializer,
    RegisterSerializer,
    UserProfileSerializer,
    UserUpdateSerializer,
    OTPRequestSerializer,
    OTPVerifySerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
    ChangePasswordSerializer,
)

User = get_user_model()


# ─── Registration ─────────────────────────────────────────────────────────────

@extend_schema(tags=["auth"])
class RegisterView(generics.CreateAPIView):
    """Create a new merchant account."""
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Auto-send verification OTP
        otp, _ = EmailVerificationOTP.generate(user)
        self._send_verification_email(user, otp)

        # Return JWT tokens immediately
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "message": "Account created. Please verify your email.",
                "user": UserProfileSerializer(user).data,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_201_CREATED,
        )

    def _send_verification_email(self, user, otp):
        send_mail(
            subject="Verify your Koraa account",
            message=f"Your verification code is: {otp}\n\nThis code expires in 10 minutes.",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )


# ─── JWT Login ────────────────────────────────────────────────────────────────

@extend_schema(tags=["auth"])
class LoginView(TokenObtainPairView):
    """Exchange email + password for JWT access + refresh tokens."""
    serializer_class = KoraaTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        # Capture last login IP
        if response.status_code == 200:
            try:
                user = User.objects.get(email=request.data.get("email"))
                ip = self._get_client_ip(request)
                User.objects.filter(pk=user.pk).update(last_login_ip=ip)
            except User.DoesNotExist:
                pass
        return response

    def _get_client_ip(self, request):
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR")


# ─── Logout ───────────────────────────────────────────────────────────────────

@extend_schema(tags=["auth"])
class LogoutView(APIView):
    """Blacklist the refresh token to log out."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data["refresh"]
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({"message": "Logged out successfully."}, status=status.HTTP_200_OK)
        except Exception:
            return Response(
                {"error": "Invalid or already blacklisted token."},
                status=status.HTTP_400_BAD_REQUEST,
            )


# ─── Email Verification ───────────────────────────────────────────────────────

@extend_schema(tags=["auth"])
class RequestEmailOTPView(APIView):
    """Send a new 6-digit OTP to the user's email."""
    permission_classes = [permissions.AllowAny]
    serializer_class = OTPRequestSerializer

    def post(self, request):
        serializer = OTPRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer._user
        otp, _ = EmailVerificationOTP.generate(user)
        send_mail(
            subject="Your Koraa verification code",
            message=f"Your code is: {otp}\n\nExpires in 10 minutes.",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
        return Response({"message": "Verification code sent."})


@extend_schema(tags=["auth"])
class VerifyEmailOTPView(APIView):
    """Confirm the 6-digit OTP to mark email as verified."""
    permission_classes = [permissions.AllowAny]
    serializer_class = OTPVerifySerializer

    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.is_verified = True
        user.save(update_fields=["is_verified"])
        return Response({"message": "Email verified successfully."})


# ─── Password Reset ───────────────────────────────────────────────────────────

@extend_schema(tags=["auth"])
class PasswordResetRequestView(APIView):
    """Initiate password reset — sends token via email."""
    permission_classes = [permissions.AllowAny]
    serializer_class = PasswordResetRequestSerializer

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        try:
            user = User.objects.get(email=email)
            raw_token, _ = PasswordResetToken.generate(user)
            reset_url = f"{settings.KORAA_DASHBOARD_URL}/reset-password?token={raw_token}"
            send_mail(
                subject="Reset your Koraa password",
                message=f"Click to reset your password:\n\n{reset_url}\n\nExpires in 1 hour.",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
            )
        except User.DoesNotExist:
            pass  # Prevent email enumeration
        return Response({"message": "If an account exists, a reset link has been sent."})


@extend_schema(tags=["auth"])
class PasswordResetConfirmView(APIView):
    """Confirm password reset with token."""
    permission_classes = [permissions.AllowAny]
    serializer_class = PasswordResetConfirmSerializer

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token_obj = serializer.validated_data["token_obj"]
        user = token_obj.user
        user.set_password(serializer.validated_data["password"])
        user.save(update_fields=["password"])
        token_obj.is_used = True
        token_obj.save(update_fields=["is_used"])
        return Response({"message": "Password reset successfully."})


# ─── Change Password ──────────────────────────────────────────────────────────

@extend_schema(tags=["auth"])
class ChangePasswordView(APIView):
    """Change password for authenticated user."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ChangePasswordSerializer

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"message": "Password changed successfully."})


# ─── Profile ──────────────────────────────────────────────────────────────────

@extend_schema(tags=["auth"])
class MeView(generics.RetrieveUpdateAPIView):
    """Get or update the authenticated user's profile."""
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return UserUpdateSerializer
        return UserProfileSerializer

    def get_object(self):
        return self.request.user
