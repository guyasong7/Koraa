"""Stores URL routing."""
from django.urls import path
from .views import (
    StoreListCreateView,
    StoreDetailView,
    StorePublishView,
    StoreUnpublishView,
    SlugAvailabilityView,
    StoreSEOAuditView,
    StoreSiteSettingsView,
    StoreAIChatView,
)

urlpatterns = [
    path("", StoreListCreateView.as_view(), name="store-list-create"),
    path("check-slug/", SlugAvailabilityView.as_view(), name="store-slug-check"),
    path("ai-chat/", StoreAIChatView.as_view(), name="store-ai-chat"),
    path("<uuid:pk>/", StoreDetailView.as_view(), name="store-detail"),
    path("<uuid:pk>/publish/", StorePublishView.as_view(), name="store-publish"),
    path("<uuid:pk>/unpublish/", StoreUnpublishView.as_view(), name="store-unpublish"),
    path("<uuid:pk>/seo/", StoreSEOAuditView.as_view(), name="store-seo"),
    path(
        "<uuid:pk>/site-settings/",
        StoreSiteSettingsView.as_view(),
        name="store-site-settings",
    ),
]
