"""Koraa — Root URL Configuration."""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from apps.analytics.urls import merchant_patterns as analytics_merchant_patterns
from apps.analytics.urls import public_patterns as analytics_public_patterns
from apps.orders.urls import merchant_patterns as orders_merchant_patterns
from apps.orders.urls import public_patterns as orders_public_patterns
from apps.storefront.urls import merchant_patterns as storefront_merchant_patterns
from apps.storefront.urls import public_patterns as storefront_public_patterns

# ─── API v1 ───────────────────────────────────────────────────────────────────
api_v1_patterns = [
    # Auth
    path("auth/", include("apps.accounts.urls")),
    # Merchants
    path("merchants/", include("apps.merchants.urls")),
    # Stores
    path("stores/", include("apps.stores.urls")),
    # Products (nested: /stores/{id}/products/)
    path("", include("apps.products.urls")),
    # Categories (nested: /stores/{id}/categories/)
    path("", include("apps.categories.urls")),
    # Storefront customization (merchant-authenticated)
    path("storefront/", include(storefront_merchant_patterns)),
    # Public storefront APIs (no auth)
    path("public/", include(storefront_public_patterns)),
    path("public/", include(orders_public_patterns)),
    # One write endpoint, called by a shopper's browser on a storefront.
    path("public/", include(analytics_public_patterns)),
    # The merchant's order book. Not nested under a store: one list with a
    # store filter, because a merchant with three shops wants one order book.
    path("orders/", include(orders_merchant_patterns)),
    # Traffic, engagement and sales. Same reasoning as the order book: not
    # nested under a store, because ?store= is the filter.
    path("analytics/", include(analytics_merchant_patterns)),
    # Payments & Subscriptions
    path("payments/", include("apps.payments.urls")),
    # Notifications
    path("notifications/", include("apps.notifications.urls")),
]

urlpatterns = [
    # Admin
    path("admin/", admin.site.urls),

    # API
    path("api/v1/", include(api_v1_patterns)),

    # API Schema & Docs
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
