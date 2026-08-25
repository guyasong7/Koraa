"""Accounts URL routing."""
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    RegisterView,
    LoginView,
    LogoutView,
    RequestEmailOTPView,
    VerifyEmailOTPView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    ChangePasswordView,
    MeView,
    SocialAuthView,
    ReferralStatsView,
)

urlpatterns = [
    # Registration & Login
    path("register/", RegisterView.as_view(), name="auth-register"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("token/refresh/", TokenRefreshView.as_view(), name="auth-token-refresh"),

    # Email verification
    path("verify-email/request/", RequestEmailOTPView.as_view(), name="auth-otp-request"),
    path("verify-email/confirm/", VerifyEmailOTPView.as_view(), name="auth-otp-verify"),

    # Password reset
    path("password-reset/request/", PasswordResetRequestView.as_view(), name="auth-password-reset-request"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),

    # Change password (authenticated)
    path("change-password/", ChangePasswordView.as_view(), name="auth-change-password"),

    # User profile
    path("me/", MeView.as_view(), name="auth-me"),
    
    # Social Auth
    path("social/", SocialAuthView.as_view(), name="auth-social"),
    
    # Referrals
    path("referrals/", ReferralStatsView.as_view(), name="auth-referrals"),
]
