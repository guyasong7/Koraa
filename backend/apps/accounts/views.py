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
from django.template.loader import render_to_string
from django.conf import settings
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema, OpenApiResponse
import logging

from .firebase import verify_firebase_id_token
from . import firebase_admin_links

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
    SocialAuthSerializer,
)

User = get_user_model()

logger = logging.getLogger(__name__)


# ─── Registration ─────────────────────────────────────────────────────────────

@extend_schema(tags=["auth"])
class RegisterView(generics.CreateAPIView):
    """Create a new merchant account."""
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        referral_code = serializer.validated_data.pop("referral_code", None)
        user = serializer.save()

        # Handle referral
        if referral_code:
            try:
                referrer = User.objects.get(referral_code=referral_code)
                if referrer != user:
                    from .models import Referral
                    Referral.objects.create(referrer=referrer, referred_user=user, status="pending")
            except User.DoesNotExist:
                pass

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
        """
        Attempt to send a Firebase Admin link-based verification email.

        If Firebase has no account for this address yet (the user just
        registered with OTP only and has no Firebase UID), fall back to the
        OTP email so verification still works.
        """
        dashboard_url = settings.KORAA_DASHBOARD_URL.rstrip("/")
        try:
            action_link = firebase_admin_links.generate_email_verification_link(user.email)
            html_message = render_to_string("emails/verify_email_link.html", {
                "action_link": action_link,
                "user_name": user.full_name or "",
                "dashboard_url": dashboard_url,
            })
            send_mail(
                subject="Verify your Koraa account",
                message=(
                    f"Click to verify your email:\n\n{action_link}\n\n"
                    "This link expires in 24 hours."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
                html_message=html_message,
            )
            return
        except Exception as exc:
            logger.warning(
                "Firebase Admin link generation failed for %s, "
                "falling back to OTP: %s",
                user.email, exc,
            )

        # Fallback: OTP-based email (works even without a Firebase account).
        html_message = render_to_string("emails/verify_email.html", {
            "otp": otp,
            "dashboard_url": dashboard_url,
        })
        send_mail(
            subject="Verify your Koraa account",
            message=f"Your verification code is: {otp}\n\nThis code expires in 10 minutes.",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
            html_message=html_message,
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
        dashboard_url = settings.KORAA_DASHBOARD_URL.rstrip("/")

        # Try a Firebase Admin link first; fall back to the OTP email.
        try:
            action_link = firebase_admin_links.generate_email_verification_link(user.email)
            html_message = render_to_string("emails/verify_email_link.html", {
                "action_link": action_link,
                "user_name": user.full_name or "",
                "dashboard_url": dashboard_url,
            })
            send_mail(
                subject="Verify your Koraa account",
                message=(
                    f"Click to verify your email:\n\n{action_link}\n\n"
                    "This link expires in 24 hours."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
                html_message=html_message,
            )
        except Exception as exc:
            logger.warning(
                "Firebase Admin link generation failed for %s, "
                "falling back to OTP: %s",
                user.email, exc,
            )
            html_message = render_to_string("emails/verify_email.html", {
                "otp": otp,
                "dashboard_url": dashboard_url,
            })
            send_mail(
                subject="Your Koraa verification code",
                message=f"Your code is: {otp}\n\nExpires in 10 minutes.",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
                html_message=html_message,
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
    """
    Initiate a Django-side password reset — sends a token via email.

    Note: the web app signs in through Firebase, so a Firebase-backed account
    must reset via /auth/forgot-password (Firebase's own flow) instead. This
    endpoint exists for accounts that authenticate against Django directly,
    such as staff using the API without Firebase.
    """
    permission_classes = [permissions.AllowAny]
    serializer_class = PasswordResetRequestSerializer

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        dashboard_url = settings.KORAA_DASHBOARD_URL.rstrip("/")

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # Prevent email enumeration — always respond the same.
            return Response({"message": "If an account exists, a reset link has been sent."})

        # ── Firebase Admin link (preferred path) ──────────────────────────────
        # Works for all accounts — Firebase, Google, or email/password.
        # `generate_password_reset_link` raises UserNotFoundError only if the
        # email has never signed in through Firebase at all (pure OTP account).
        try:
            action_link = firebase_admin_links.generate_password_reset_link(email)
            html_message = render_to_string("emails/password_reset_link.html", {
                "action_link": action_link,
                "user_name": user.full_name or "",
                "dashboard_url": dashboard_url,
            })
            send_mail(
                subject="Reset your Koraa password",
                message=(
                    f"Click to reset your password:\n\n{action_link}\n\n"
                    "This link expires in 1 hour."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=True,
                html_message=html_message,
            )
            return Response({"message": "If an account exists, a reset link has been sent."})
        except Exception as exc:
            logger.warning(
                "Firebase Admin password reset link failed for %s, "
                "falling back to Django token: %s",
                email, exc,
            )

        # ── Fallback: Django token reset ──────────────────────────────────────
        # Used for pure OTP-only accounts that never created a Firebase session.
        if not user.has_usable_password():
            send_mail(
                subject="Reset your Koraa password",
                message=(
                    "Your Koraa account signs in with Google or with an email "
                    "password managed by Firebase.\n\n"
                    f"Reset it here: {dashboard_url}/auth/forgot-password\n"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=True,
            )
        else:
            raw_token, _ = PasswordResetToken.generate(user)
            reset_url = f"{dashboard_url}/auth/reset-password?token={raw_token}"
            send_mail(
                subject="Reset your Koraa password",
                message=f"Click to reset your password:\n\n{reset_url}\n\nExpires in 1 hour.",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=True,
            )
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


# ─── Social Authentication ────────────────────────────────────────────────────

@extend_schema(tags=["auth"])
class SocialAuthView(APIView):
    """Authenticate with Google or Apple ID token."""
    permission_classes = [permissions.AllowAny]
    serializer_class = SocialAuthSerializer

    def post(self, request):
        serializer = SocialAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        provider = serializer.validated_data["provider"]
        token = serializer.validated_data["id_token"]
        provided_name = serializer.validated_data.get("full_name", "")

        email = None
        full_name = None
        picture = None

        try:
            # Verify the Firebase ID token against Google's public certificates.
            # This completely avoids the need for a Firebase Admin Service
            # Account JSON. See apps/accounts/firebase.py for why the fetch is
            # cached — google-auth re-downloads those certificates on every
            # call, which used to put a round trip to Google in front of every
            # Google sign-in.
            decoded_token = verify_firebase_id_token(token)
            email = decoded_token.get("email")
            full_name = decoded_token.get("name") or provided_name
            email_verified = decoded_token.get("email_verified", False)
            # Google sends the profile photo as a CDN URL; the client asks for
            # the `profile` scope, so it is present for Google sign-ins.
            picture = decoded_token.get("picture") or ""
        except ValueError as exc:
            # google-auth raises ValueError for a token that is genuinely bad —
            # wrong audience, bad signature, past its `exp`. Which of those it
            # was is diagnostic information about our verification setup, not
            # something an unauthenticated caller should be told. It goes to
            # the logs; the client gets one flat answer.
            logger.warning("Firebase token verification failed: %s", exc)
            return Response(
                {"error": "Invalid or expired sign-in token. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            # Anything else is our problem, not the token's: a Redis blip on
            # the certificate cache, or Google unreachable. Reporting those as
            # a bad token sent people off to re-check credentials that were
            # fine, and made the failure invisible in the logs among real
            # rejections — so it is a 503, logged with a traceback.
            logger.exception(
                "Google sign-in unavailable (%s): %s", type(exc).__name__, exc
            )
            return Response(
                {"error": "Sign-in is temporarily unavailable. Please try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if not email:
            return Response({"error": "Email not provided by provider."}, status=status.HTTP_400_BAD_REQUEST)

        referral_code = serializer.validated_data.get("referral_code", "")

        # Get or create user
        user, created = User.objects.get_or_create(email=email)
        if created:
            user.full_name = full_name or email.split("@")[0]
            user.is_verified = email_verified
            user.avatar_url = picture
            user.set_unusable_password()
            user.save()

            # Handle referral
            if referral_code:
                try:
                    referrer = User.objects.get(referral_code=referral_code)
                    if referrer != user:
                        from .models import Referral
                        Referral.objects.create(referrer=referrer, referred_user=user, status="pending")
                except User.DoesNotExist:
                    pass
        else:
            # If they had no name previously, update it
            if not user.full_name and full_name:
                user.full_name = full_name
                user.save(update_fields=["full_name"])
            # Ensure social accounts are verified if the token says so
            if email_verified and not user.is_verified:
                user.is_verified = True
                user.save(update_fields=["is_verified"])
            # Refreshed on every sign-in, not just the first: Google rotates
            # these URLs, and a stale one renders as a broken image. It never
            # touches `avatar`, so a photo the merchant uploaded still wins.
            if picture and user.avatar_url != picture:
                user.avatar_url = picture
                user.save(update_fields=["avatar_url"])
        refresh = RefreshToken.for_user(user)
        return Response({
            "message": "Login successful.",
            "user": UserProfileSerializer(user).data,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        }, status=status.HTTP_200_OK)


# ─── Referrals ────────────────────────────────────────────────────────────────

@extend_schema(tags=["auth"])
class ReferralStatsView(APIView):
    """
    GET /auth/referrals/
    Get the authenticated user's referral code, link, and list of referred users.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from .models import Referral
        from .serializers import ReferralSerializer
        
        user = request.user
        if not user.referral_code:
            # Generate if missing for some reason
            user.save()
            
        referrals = Referral.objects.filter(referrer=user).order_by("-created_at")
        serializer = ReferralSerializer(referrals, many=True)
        
        total_earned = sum(r.reward_amount for r in referrals if r.status == "completed")
        
        base_url = settings.KORAA_DASHBOARD_URL.rstrip("/")
        referral_link = f"{base_url}/auth/register?ref={user.referral_code}"
        
        return Response({
            "referral_code": user.referral_code,
            "referral_link": referral_link,
            "total_referred": referrals.count(),
            "total_earned": total_earned,
            "referrals": serializer.data
        })

