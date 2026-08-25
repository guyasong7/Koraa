from django.urls import path
from .views import (
    MerchantCreateView, MerchantProfileView, merchant_dashboard_stats,
    MerchantIdentityUploadView, MerchantTeamView, MerchantTeamDetailView,
    MerchantPayoutAccountListCreateView, MerchantPayoutAccountDetailView
)

urlpatterns = [
    path("onboard/", MerchantCreateView.as_view(), name="merchant-onboard"),
    path("me/", MerchantProfileView.as_view(), name="merchant-profile"),
    path("identity/", MerchantIdentityUploadView.as_view(), name="merchant-identity"),
    path("stats/", merchant_dashboard_stats, name="merchant-stats"),
    path("team/", MerchantTeamView.as_view(), name="merchant-team"),
    path("team/<uuid:pk>/", MerchantTeamDetailView.as_view(), name="merchant-team-detail"),

    path("payouts/", MerchantPayoutAccountListCreateView.as_view(), name="merchant-payouts"),
    path("payouts/<uuid:pk>/", MerchantPayoutAccountDetailView.as_view(), name="merchant-payouts-detail"),
]
