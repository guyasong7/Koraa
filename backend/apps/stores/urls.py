"""Stores URL routing."""
from django.urls import path
from .views import (
    StoreListCreateView,
    StoreDetailView,
    StorePublishView,
    StoreUnpublishView,
    SlugAvailabilityView,
)

urlpatterns = [
    path("", StoreListCreateView.as_view(), name="store-list-create"),
    path("check-slug/", SlugAvailabilityView.as_view(), name="store-slug-check"),
    path("<uuid:pk>/", StoreDetailView.as_view(), name="store-detail"),
    path("<uuid:pk>/publish/", StorePublishView.as_view(), name="store-publish"),
    path("<uuid:pk>/unpublish/", StoreUnpublishView.as_view(), name="store-unpublish"),
]
