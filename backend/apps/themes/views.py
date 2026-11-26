"""
Themes & Templates API views.
"""

from django.db.models import Q
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from apps.themes.models import (
    Theme,
    Template,
    TemplateVersion,
    TemplatePurchase,
    TemplateReview,
)
from apps.themes.serializers import (
    ThemeSerializer,
    TemplateListSerializer,
    TemplateDetailSerializer,
    TemplateCreateSerializer,
    TemplateVersionSerializer,
    TemplatePurchaseSerializer,
    TemplateReviewSerializer,
    TemplateReviewCreateSerializer,
)


class TemplatePagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 48


class IsAuthorOrStaff(permissions.BasePermission):
    """Only template author or staff can modify."""

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.author == request.user or request.user.is_staff


class ThemeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Platform-managed themes (read-only for merchants).
    """

    queryset = Theme.objects.filter(is_active=True)
    serializer_class = ThemeSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "slug"
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["category", "is_free"]
    search_fields = ["name", "description"]


class TemplateViewSet(viewsets.ModelViewSet):
    """
    Storefront template marketplace API.

    - List: public, approved templates (with filters)
    - Detail: public template info
    - Create: authenticated users (community templates)
    - Update: author only
    - Delete: author or staff
    """

    queryset = (
        Template.objects
        .select_related("author")
        .filter(status=Template.Status.APPROVED)
    )
    permission_classes = [permissions.AllowAny]
    pagination_class = TemplatePagination
    lookup_field = "slug"
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = [
        "template_type",
        "category",
        "is_free",
        "is_featured",
        "is_verified",
    ]
    search_fields = ["name", "description", "tags"]
    ordering_fields = [
        "downloads",
        "rating_average",
        "created_at",
        "price",
        "installations",
    ]
    ordering = ["-is_featured", "-rating_average", "-downloads", "-created_at"]

    def get_serializer_class(self):
        if self.action == "list":
            return TemplateListSerializer
        if self.action == "create":
            return TemplateCreateSerializer
        return TemplateDetailSerializer

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        qs = super().get_queryset().select_related("author")

        # Authors and staff can see their own drafts/pending
        user = self.request.user
        if self.action in ["retrieve", "list"] and user.is_authenticated:
            if user.is_staff:
                qs = Template.objects.select_related("author")
            elif self.action == "retrieve":
                # Authors can view their own non-approved templates
                qs = Template.objects.select_related("author").filter(
                    Q(status=Template.Status.APPROVED) | Q(author=user)
                )
        return qs

    def perform_create(self, serializer):
        """Create template with review workflow."""
        template = serializer.save(
            author=self.request.user,
            status=Template.Status.PENDING_REVIEW,
        )
        # TODO: Notify admins for review

    @action(detail=True, methods=["get"])
    def versions(self, request, slug=None):
        """List all versions of a template."""
        template = self.get_object()
        versions = template.versions.all()
        serializer = TemplateVersionSerializer(versions, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def purchase(self, request, slug=None):
        """Purchase a template."""
        template = self.get_object()

        # Free templates: no payment needed
        if template.is_free:
            # Check if already obtained
            _, created = TemplatePurchase.objects.get_or_create(
                template=template,
                user=request.user,
                defaults={
                    "amount_paid": 0,
                    "currency": template.currency,
                }
            )
            return Response(
                {"detail": "Template obtained (free)."},
                status=status.HTTP_201_CREATED,
            )

        # Paid: initiate Fapshi payment
        from apps.themes.payments import (
            initiate_template_purchase,
            TemplatePurchaseError,
        )

        phone_number = request.data.get("phone_number")
        store_id = request.data.get("store_id")

        if not phone_number:
            return Response(
                {"detail": "Phone number is required for payment."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get store if provided
        store = None
        if store_id:
            from apps.stores.models import Store
            try:
                store = Store.objects.get(id=store_id, merchant__user=request.user)
            except Store.DoesNotExist:
                return Response(
                    {"detail": "Store not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        try:
            result = initiate_template_purchase(
                template=template,
                user=request.user,
                phone_number=phone_number,
                store=store,
            )
            return Response(result, status=status.HTTP_200_OK)

        except TemplatePurchaseError as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            return Response(
                {"detail": f"Payment failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def download(self, request, slug=None):
        """Download template package (requires purchase/free)."""
        template = self.get_object()

        # Check access
        has_access = template.is_free or TemplatePurchase.objects.filter(
            template=template, user=request.user
        ).exists()

        if not has_access:
            return Response(
                {"detail": "Purchase required to download this template."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Increment download count
        Template.objects.filter(pk=template.pk).update(
            downloads=models.F("downloads") + 1
        )

        return Response({
            "package_url": template.package_url,
            "version": template.version,
            "package_hash": template.package_hash,
        })

    @action(detail=True, methods=["get", "post"])
    def reviews(self, request, slug=None):
        """List or create reviews for a template."""
        template = self.get_object()

        if request.method == "GET":
            reviews = template.reviews.filter(is_visible=True)
            serializer = TemplateReviewSerializer(reviews, many=True)
            return Response(serializer.data)

        # POST: create review
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Authentication required."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = TemplateReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        review = TemplateReview.objects.create(
            template=template,
            user=request.user,
            is_verified_purchase=TemplatePurchase.objects.filter(
                template=template, user=request.user
            ).exists(),
            **serializer.validated_data
        )

        return Response(
            TemplateReviewSerializer(review).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def my_templates(self, request):
        """List user's purchased templates."""
        purchases = TemplatePurchase.objects.filter(
            user=request.user
        ).select_related("template", "template__author")

        serializer = TemplatePurchaseSerializer(purchases, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def my_uploads(self, request):
        """List templates authored by current user."""
        templates = Template.objects.filter(
            author=request.user
        ).select_related("author")

        page = self.paginate_queryset(templates)
        if page is not None:
            serializer = TemplateListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = TemplateListSerializer(templates, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def stats(self, request):
        """Author stats for current user."""
        templates = Template.objects.filter(author=request.user)
        total_downloads = sum(t.downloads for t in templates)
        total_sales = TemplatePurchase.objects.filter(
            template__author=request.user
        ).count()
        total_revenue = sum(
            p.amount_paid for p in TemplatePurchase.objects.filter(
                template__author=request.user
            )
        )

        return Response({
            "total_templates": templates.count(),
            "total_downloads": total_downloads,
            "total_sales": total_sales,
            "total_revenue": total_revenue,
        })


# Import for download action
from django.db import models
