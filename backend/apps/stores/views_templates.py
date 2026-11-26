from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound, PermissionDenied
from drf_spectacular.utils import extend_schema, OpenApiParameter
from apps.themes.models import Template, TemplatePurchase
from apps.stores.models import Store
from apps.stores.access import accessible_stores


@extend_schema(
    tags=["stores"],
    request={
        "application/json": {
            "type": "object",
            "properties": {
                "template_id": {"type": "string", "format": "uuid"}
            },
            "required": ["template_id"]
        }
    },
    responses={
        200: {
            "type": "object",
            "properties": {
                "message": {"type": "string"},
                "template_name": {"type": "string"}
            }
        }
    }
)
class ApplyTemplateView(APIView):
    """POST /stores/{pk}/apply-template/ — Apply a template to a store."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        # Get store and verify access
        store = accessible_stores(request.user).filter(pk=pk).first()
        if store is None:
            raise NotFound("Store not found.")

        template_id = request.data.get("template_id")
        if not template_id:
            return Response(
                {"detail": "template_id is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get template
        try:
            template = Template.objects.get(id=template_id, status="approved")
        except Template.DoesNotExist:
            raise NotFound("Template not found or not approved.")

        # Check if template is free or already purchased
        if template.price > 0:
            purchase = TemplatePurchase.objects.filter(
                user=request.user,
                template=template
            ).first()

            if not purchase:
                return Response(
                    {
                        "detail": "You must purchase this template before applying it.",
                        "price": template.price,
                        "template_name": template.name
                    },
                    status=status.HTTP_402_PAYMENT_REQUIRED
                )

        # Apply template to store
        # For now, we'll just store the template reference
        # In a full implementation, this would apply CSS/theme settings
        store.template_applied = template
        store.save()

        # Create purchase record if free template and not already purchased
        if template.price == 0:
            TemplatePurchase.objects.get_or_create(
                user=request.user,
                template=template,
                defaults={
                    "amount_paid": 0
                }
            )

        return Response({
            "message": f"Template '{template.name}' applied successfully!",
            "template_name": template.name
        })
