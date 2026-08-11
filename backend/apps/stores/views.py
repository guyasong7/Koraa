"""
Stores views.

All store operations are scoped to the authenticated merchant's stores (tenant isolation).
A merchant can never access or modify another merchant's store.
"""
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import NotFound, PermissionDenied
from drf_spectacular.utils import extend_schema

from .models import Store
from .serializers import (
    StoreListSerializer,
    StoreDetailSerializer,
    StoreCreateSerializer,
    StoreUpdateSerializer,
    StoreSlugCheckSerializer,
)


class MerchantStorePermission(permissions.BasePermission):
    """Ensure the store belongs to the requesting merchant."""
    message = "You do not have permission to access this store."

    def has_object_permission(self, request, view, obj):
        return obj.merchant.user == request.user


def get_merchant_or_error(user):
    """Retrieve merchant or raise 403."""
    try:
        return user.merchant
    except Exception:
        raise PermissionDenied("You must complete merchant onboarding first.")


@extend_schema(tags=["stores"])
class StoreListCreateView(generics.ListCreateAPIView):
    """
    GET  /stores/          — List all stores for the authenticated merchant
    POST /stores/          — Create a new store
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return StoreCreateSerializer
        return StoreListSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Store.objects.none()
        merchant = get_merchant_or_error(self.request.user)
        return Store.objects.filter(merchant=merchant).order_by("-created_at")

    def create(self, request, *args, **kwargs):
        get_merchant_or_error(request.user)  # ensures merchant exists
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        store = serializer.save()
        return Response(
            StoreDetailSerializer(store).data,
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["stores"])
class StoreDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /stores/{id}/  — Retrieve store
    PATCH  /stores/{id}/  — Partial update
    DELETE /stores/{id}/  — Soft delete (sets status to suspended)
    """
    permission_classes = [permissions.IsAuthenticated, MerchantStorePermission]

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return StoreUpdateSerializer
        return StoreDetailSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Store.objects.none()
        merchant = get_merchant_or_error(self.request.user)
        return Store.objects.filter(merchant=merchant)

    def destroy(self, request, *args, **kwargs):
        """Soft-delete: suspend instead of hard delete."""
        store = self.get_object()
        store.status = Store.Status.SUSPENDED
        store.save(update_fields=["status"])
        return Response({"message": "Store suspended."}, status=status.HTTP_200_OK)


@extend_schema(tags=["stores"], responses={200: StoreDetailSerializer})
class StorePublishView(APIView):
    """POST /stores/{id}/publish/ — Publish the store."""
    serializer_class = StoreDetailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        store = self._get_store(request.user, pk)
        store.publish()
        return Response(
            {"message": "Store published.", "storefront_url": store.storefront_url}
        )

    def _get_store(self, user, pk):
        try:
            store = Store.objects.get(pk=pk, merchant__user=user)
        except Store.DoesNotExist:
            raise NotFound("Store not found.")
        return store


@extend_schema(tags=["stores"], responses={200: StoreDetailSerializer})
class StoreUnpublishView(APIView):
    """POST /stores/{id}/unpublish/ — Take the store offline."""
    serializer_class = StoreDetailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            store = Store.objects.get(pk=pk, merchant__user=request.user)
        except Store.DoesNotExist:
            raise NotFound("Store not found.")
        store.unpublish()
        return Response({"message": "Store taken offline."})


@extend_schema(tags=["stores"], responses={200: StoreSlugCheckSerializer})
class SlugAvailabilityView(APIView):
    """GET /stores/check-slug/?slug=mybrand — Check if a slug is available."""
    serializer_class = StoreSlugCheckSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = StoreSlugCheckSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response({"slug": serializer.validated_data["slug"], "available": True})
