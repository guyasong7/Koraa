from django.urls import path
from .views import (
    ActiveSubscriptionView,
    FapshiWebhookView,
    InitiatePaymentView,
    PaymentCallbackView,
    PlanCatalogueView,
)

urlpatterns = [
    path("plans/", PlanCatalogueView.as_view(), name="plan-catalogue"),
    path("initiate/", InitiatePaymentView.as_view(), name="payment-initiate"),
    path("callback/", PaymentCallbackView.as_view(), name="payment-callback"),
    path("webhook/fapshi/", FapshiWebhookView.as_view(), name="fapshi-webhook"),
    path("subscription/", ActiveSubscriptionView.as_view(), name="active-subscription"),
]
