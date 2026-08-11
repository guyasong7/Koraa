"""Merchants views."""
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from .models import Merchant, MerchantIdentity
from apps.stores.models import Store
from apps.products.models import Product
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from .serializers import MerchantSerializer, MerchantCreateSerializer, MerchantUpdateSerializer, MerchantIdentitySerializer


class IsMerchantOwner(permissions.BasePermission):
    """Only the merchant who owns this profile can modify it."""

    def has_object_permission(self, request, view, obj):
        return obj.user == request.user


@extend_schema(tags=["merchants"])
class MerchantProfileView(generics.RetrieveUpdateAPIView):
    """
    GET  /merchants/me/  — Retrieve own merchant profile
    PUT  /merchants/me/  — Full update
    PATCH /merchants/me/ — Partial update
    """
    permission_classes = [permissions.IsAuthenticated, IsMerchantOwner]

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return MerchantUpdateSerializer
        return MerchantSerializer

    def get_object(self):
        try:
            return self.request.user.merchant
        except Merchant.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound("Merchant profile not found. Please complete onboarding.")


@extend_schema(tags=["merchants"])
class MerchantCreateView(generics.CreateAPIView):
    """
    POST /merchants/onboard/ — Create merchant profile during onboarding
    """
    serializer_class = MerchantCreateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        merchant = serializer.save()
        # Update user role
        if request.user.role != "merchant":
            request.user.role = "merchant"
            request.user.save(update_fields=["role"])
        return Response(
            MerchantSerializer(merchant).data,
            status=status.HTTP_201_CREATED,
        )

@extend_schema(tags=["merchants"], responses={200: dict})
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def merchant_dashboard_stats(request):
    """
    GET /merchants/stats/ — Get dashboard statistics (stores, products, orders, revenue)
    """
    try:
        merchant = request.user.merchant
    except Merchant.DoesNotExist:
        return Response({"detail": "Merchant profile not found."}, status=status.HTTP_404_NOT_FOUND)

    total_stores = Store.objects.filter(merchant=merchant).count()
    total_products = Product.objects.filter(store__merchant=merchant).count()
    
    # Orders are not yet implemented, return 0
    total_orders = 0
    total_revenue = 0.00

    return Response({
        "total_stores": total_stores,
        "total_products": total_products,
        "total_orders": total_orders,
        "total_revenue": total_revenue,
    })

@extend_schema(tags=["merchants"])
class MerchantIdentityUploadView(generics.UpdateAPIView):
    """
    PATCH /merchants/identity/ — Upload identity documents or update phone/location status
    """
    serializer_class = MerchantIdentitySerializer
    permission_classes = [permissions.IsAuthenticated, IsMerchantOwner]

    def get_object(self):
        try:
            merchant = self.request.user.merchant
        except Merchant.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound("Merchant profile not found.")
        
        identity, _ = MerchantIdentity.objects.get_or_create(merchant=merchant)
        # Ensure the merchant can be used for permission check
        identity.user = merchant.user
        return identity

