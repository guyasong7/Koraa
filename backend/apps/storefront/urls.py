"""Storefront URL routing."""
from django.urls import path
from .views import (
    StorefrontConfigView,
    StorefrontSectionListCreateView,
    StorefrontSectionDetailView,
    SectionReorderView,
    StorefrontPublishView,
    BlueprintCatalogueView,
    BlueprintApplyView,
    SectionImageUploadView,
    StoreAssetUploadView,
    PublicServiceFormSubmitView,
    PublicStorefrontConfigView,
    PublicStorefrontSectionsView,
    PublicStorefrontByDomainView,
    PreviewStorefrontView,
    ServiceFormSubmissionDetailView,
    ServiceFormSubmissionListView,
    ServiceFormView,
    StorefrontRobotsView,
    StorefrontUnlockView,
)

# Merchant-authenticated
merchant_patterns = [
    path("config/", StorefrontConfigView.as_view(), name="storefront-config"),
    path("blueprint/", BlueprintCatalogueView.as_view(), name="storefront-blueprint"),
    path("blueprint/apply/", BlueprintApplyView.as_view(), name="storefront-blueprint-apply"),
    path("sections/", StorefrontSectionListCreateView.as_view(), name="storefront-sections"),
    path("sections/reorder/", SectionReorderView.as_view(), name="storefront-sections-reorder"),
    path("sections/<uuid:pk>/", StorefrontSectionDetailView.as_view(), name="storefront-section-detail"),
    path("sections/<uuid:pk>/upload-image/", SectionImageUploadView.as_view(), name="section-upload-image"),
    path("store-assets/", StoreAssetUploadView.as_view(), name="store-asset-upload"),
    path("service-form/", ServiceFormView.as_view(), name="storefront-service-form"),
    path("enquiries/", ServiceFormSubmissionListView.as_view(), name="storefront-enquiries"),
    path("enquiries/<uuid:pk>/", ServiceFormSubmissionDetailView.as_view(), name="storefront-enquiry-detail"),
    path("publish/", StorefrontPublishView.as_view(), name="storefront-publish"),
]

# Public (no auth)
public_patterns = [
    path("storefront/by-domain/", PublicStorefrontByDomainView.as_view(), name="storefront-by-domain"),
    path("storefront/<slug:slug>/config/", PublicStorefrontConfigView.as_view(), name="storefront-public-config"),
    path("storefront/<slug:slug>/sections/", PublicStorefrontSectionsView.as_view(), name="storefront-public-sections"),
    path("storefront/<slug:slug>/unlock/", StorefrontUnlockView.as_view(), name="storefront-unlock"),
    path("storefront/<slug:slug>/enquiries/", PublicServiceFormSubmitView.as_view(), name="storefront-enquiry-submit"),
    path("storefront/<slug:slug>/robots.txt", StorefrontRobotsView.as_view(), name="storefront-robots"),
    path("storefront/preview/<uuid:store_id>/", PreviewStorefrontView.as_view(), name="storefront-preview"),
]
