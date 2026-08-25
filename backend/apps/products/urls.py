"""Products URL routing — nested under stores."""
from django.urls import path
from .views import (
    ProductAIAutoFillView,
    ProductDetailView,
    ProductExportView,
    ProductFileDetailView,
    ProductFileListCreateView,
    ProductImageDeleteView,
    ProductImageUploadView,
    ProductImportView,
    ProductListCreateView,
)

urlpatterns = [
    path("stores/<uuid:store_pk>/products/", ProductListCreateView.as_view(), name="product-list-create"),
    path("stores/<uuid:store_pk>/products/export/", ProductExportView.as_view(), name="product-export"),
    path("stores/<uuid:store_pk>/products/import/", ProductImportView.as_view(), name="product-import"),
    path("stores/<uuid:store_pk>/products/ai-suggest/", ProductAIAutoFillView.as_view(), name="product-ai-suggest"),
    path("stores/<uuid:store_pk>/products/<uuid:pk>/", ProductDetailView.as_view(), name="product-detail"),
    path("stores/<uuid:store_pk>/products/<uuid:product_pk>/images/upload/", ProductImageUploadView.as_view(), name="product-image-upload"),
    path("stores/<uuid:store_pk>/products/<uuid:product_pk>/images/<uuid:pk>/", ProductImageDeleteView.as_view(), name="product-image-delete"),
    path("stores/<uuid:store_pk>/products/<uuid:product_pk>/files/", ProductFileListCreateView.as_view(), name="product-file-list-create"),
    path("stores/<uuid:store_pk>/products/<uuid:product_pk>/files/<uuid:pk>/", ProductFileDetailView.as_view(), name="product-file-detail"),
]
