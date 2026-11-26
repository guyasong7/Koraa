"""
Template purchase verification endpoint.
"""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.themes.payments import verify_template_purchase, TemplatePurchaseError


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def verify_purchase(request, purchase_id):
    """
    Verify template purchase payment status.

    GET /api/v1/templates/purchases/{purchase_id}/verify/
    """
    try:
        result = verify_template_purchase(purchase_id)
        return Response(result)
    except TemplatePurchaseError as e:
        return Response(
            {"detail": str(e)},
            status=status.HTTP_404_NOT_FOUND,
        )
    except Exception as e:
        return Response(
            {"detail": f"Verification failed: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
def template_purchase_webhook(request):
    """
    Handle Fapshi webhook for template purchases.

    POST /api/v1/templates/webhook/
    """
    from apps.themes.payments import handle_template_purchase_webhook

    # Verify webhook signature (using Fapshi's signature verification)
    from apps.payments.views import verify_fapshi_signature

    if not verify_fapshi_signature(request):
        return Response(
            {"detail": "Invalid signature"},
            status=status.HTTP_403_FORBIDDEN,
        )

    result = handle_template_purchase_webhook(request.data)
    return Response(result)
