"""
Themes & Templates URL Configuration.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from apps.themes import views
from apps.themes.views_payment import verify_purchase, template_purchase_webhook

router = DefaultRouter()
router.register(r"themes", views.ThemeViewSet, basename="theme")
router.register(r"templates", views.TemplateViewSet, basename="template")

urlpatterns = [
    path("", include(router.urls)),
    # Payment verification
    path(
        "templates/purchases/<uuid:purchase_id>/verify/",
        verify_purchase,
        name="verify-template-purchase"
    ),
    # Fapshi webhook for template purchases
    path(
        "templates/webhook/",
        template_purchase_webhook,
        name="template-purchase-webhook"
    ),
]
