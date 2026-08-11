"""Products views — store-scoped."""
from rest_framework import generics, permissions, filters
from rest_framework.exceptions import NotFound
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema

from apps.stores.models import Store
from .models import Product
from .serializers import (
    ProductListSerializer,
    ProductDetailSerializer,
    ProductCreateSerializer,
)


def get_store_for_merchant(user, store_pk):
    try:
        return Store.objects.get(pk=store_pk, merchant__user=user)
    except Store.DoesNotExist:
        raise NotFound("Store not found.")


@extend_schema(tags=["products"])
class ProductListCreateView(generics.ListCreateAPIView):
    """
    GET  /stores/{store_id}/products/  — List products (with filters)
    POST /stores/{store_id}/products/  — Create product
    """
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "product_type", "is_featured", "category"]
    search_fields = ["name", "description", "variants__sku"]
    ordering_fields = ["created_at", "name", "base_price"]
    ordering = ["-created_at"]

    def get_store(self):
        return get_store_for_merchant(self.request.user, self.kwargs["store_pk"])

    def get_serializer_class(self):
        return ProductCreateSerializer if self.request.method == "POST" else ProductListSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Product.objects.none()
        store = self.get_store()
        return (
            Product.objects
            .filter(store=store)
            .select_related("category")
            .prefetch_related("images", "variants")
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["store"] = self.get_store()
        return ctx

    def create(self, request, *args, **kwargs):
        from rest_framework import status
        from rest_framework.response import Response
        get_store_for_merchant(request.user, self.kwargs["store_pk"])
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        return Response(ProductDetailSerializer(product).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["products"])
class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET|PATCH|DELETE /stores/{store_id}/products/{id}/"""
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return ProductCreateSerializer
        return ProductDetailSerializer

    def get_queryset(self):
        store = get_store_for_merchant(self.request.user, self.kwargs["store_pk"])
        return (
            Product.objects
            .filter(store=store)
            .select_related("category")
            .prefetch_related("images", "options__values", "variants__option_values")
        )
