from django.urls import path
from .views import MerchantCreateView, MerchantProfileView, merchant_dashboard_stats, MerchantIdentityUploadView

urlpatterns = [
    path("onboard/", MerchantCreateView.as_view(), name="merchant-onboard"),
    path("me/", MerchantProfileView.as_view(), name="merchant-profile"),
    path("identity/", MerchantIdentityUploadView.as_view(), name="merchant-identity"),
    path("stats/", merchant_dashboard_stats, name="merchant-stats"),
]
