from django.urls import path
from .views import (
    MerchantCreateView, MerchantProfileView, merchant_dashboard_stats,
    MerchantIdentityUploadView, MerchantStartVerificationView, DiditWebhookView,
    MerchantTeamView, MerchantTeamDetailView,
    MerchantPayoutAccountListCreateView, MerchantPayoutAccountDetailView,
    PhoneSendOTPView, PhoneVerifyOTPView,
)

urlpatterns = [
    path("onboard/", MerchantCreateView.as_view(), name="merchant-onboard"),
    path("me/", MerchantProfileView.as_view(), name="merchant-profile"),
    path("identity/", MerchantIdentityUploadView.as_view(), name="merchant-identity"),
    path("identity/verify/", MerchantStartVerificationView.as_view(), name="merchant-identity-verify"),
    path("identity/webhook/", DiditWebhookView.as_view(), name="merchant-identity-webhook"),
    path("stats/", merchant_dashboard_stats, name="merchant-stats"),
    path("team/", MerchantTeamView.as_view(), name="merchant-team"),
    path("team/<uuid:pk>/", MerchantTeamDetailView.as_view(), name="merchant-team-detail"),

    path("payouts/", MerchantPayoutAccountListCreateView.as_view(), name="merchant-payouts"),
    path("payouts/<uuid:pk>/", MerchantPayoutAccountDetailView.as_view(), name="merchant-payouts-detail"),

    # Phone verification via SMS OTP
    path("phone/send-otp/", PhoneSendOTPView.as_view(), name="merchant-phone-send-otp"),
    path("phone/verify-otp/", PhoneVerifyOTPView.as_view(), name="merchant-phone-verify-otp"),
]
