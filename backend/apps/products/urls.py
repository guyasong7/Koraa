"""Products URL routing — nested under stores."""
from django.urls import path
from .views import ProductListCreateView, ProductDetailView

urlpatterns = [
    path("stores/<uuid:store_pk>/products/", ProductListCreateView.as_view(), name="product-list-create"),
    path("stores/<uuid:store_pk>/products/<uuid:pk>/", ProductDetailView.as_view(), name="product-detail"),
]
