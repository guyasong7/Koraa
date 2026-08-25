"""Categories views — store-scoped."""
from rest_framework import generics, permissions
from rest_framework.exceptions import NotFound
from drf_spectacular.utils import extend_schema

from apps.stores.access import accessible_stores
from .models import Category
from .serializers import CategorySerializer


def get_store_for_merchant(user, store_pk):
    """The store if the user owns it or holds an accepted invite to it."""
    store = accessible_stores(user).filter(pk=store_pk).first()
    if store is None:
        raise NotFound("Store not found.")
    return store


@extend_schema(tags=["categories"])
class CategoryListCreateView(generics.ListCreateAPIView):
    """GET|POST /stores/{store_id}/categories/"""
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_store(self):
        return get_store_for_merchant(self.request.user, self.kwargs["store_pk"])

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Category.objects.none()
        store = self.get_store()
        return Category.objects.filter(store=store, parent=None)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["store"] = self.get_store()
        return ctx


@extend_schema(tags=["categories"])
class CategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET|PATCH|DELETE /stores/{store_id}/categories/{id}/"""
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Category.objects.none()
        store = get_store_for_merchant(self.request.user, self.kwargs["store_pk"])
        return Category.objects.filter(store=store)
