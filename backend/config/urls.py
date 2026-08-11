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
