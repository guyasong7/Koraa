"""Merchants views."""
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, OpenApiParameter

from .models import Merchant, MerchantIdentity, MerchantStaff
from apps.orders.models import Order
from apps.products.models import Product
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from apps.merchants.utils_helpers import get_active_merchant, require_own_merchant
from apps.stores.access import accessible_stores
from apps.accounts.models import PhoneVerificationOTP
from apps.accounts.camoo_sms import send_sms
from .serializers import (
    MerchantSerializer, MerchantCreateSerializer, 
    MerchantUpdateSerializer, MerchantIdentitySerializer,
    MerchantStaffSerializer, MerchantPayoutAccountSerializer
)

User = get_user_model()


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
            return get_active_merchant(self.request.user)
        except Exception:
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
    GET /merchants/stats/ — Dashboard totals across every store the caller can open

    Scoped to accessible stores rather than to a merchant account. A teammate
    invited to one shop sees that shop's orders and revenue; they do not see
    the rest of the owner's business, which is what scoping by merchant did.
    """
    stores = accessible_stores(request.user)
    if not stores.exists():
        return Response({
            "total_stores": 0,
            "total_products": 0,
            "total_orders": 0,
            "paid_orders": 0,
            "pending_orders": 0,
            "total_revenue": 0.0,
            "revenue_this_month": 0.0,
        })

    total_stores = stores.count()
    total_products = Product.objects.filter(store__in=stores).count()

    # Orders exist — these used to be hardcoded to 0, so every merchant's
    # dashboard reported no sales no matter how much they had sold.
    orders = Order.objects.filter(store__in=stores)
    paid_orders = orders.filter(payment_status=Order.PaymentStatus.PAID)

    total_orders = orders.count()
    total_revenue = paid_orders.aggregate(
        total=Coalesce(Sum("total_amount"), Decimal("0"))
    )["total"]

    month_start = timezone.now().replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    revenue_this_month = paid_orders.filter(
        created_at__gte=month_start
    ).aggregate(total=Coalesce(Sum("total_amount"), Decimal("0")))["total"]

    return Response({
        "total_stores": total_stores,
        "total_products": total_products,
        "total_orders": total_orders,
        "paid_orders": paid_orders.count(),
        "pending_orders": orders.filter(
            payment_status=Order.PaymentStatus.PENDING
        ).count(),
        "total_revenue": float(total_revenue),
        "revenue_this_month": float(revenue_this_month),
    })

@extend_schema(tags=["merchants"])
class MerchantIdentityUploadView(generics.RetrieveUpdateAPIView):
    """
    GET  /merchants/identity/ — Retrieve current identity verification status
    PATCH /merchants/identity/ — Upload identity documents or update phone/location status
    """
    serializer_class = MerchantIdentitySerializer
    permission_classes = [permissions.IsAuthenticated, IsMerchantOwner]

    def get_object(self):
        try:
            merchant = get_active_merchant(self.request.user)
        except Exception:
            from rest_framework.exceptions import NotFound
            raise NotFound("Merchant profile not found.")
        
        identity, _ = MerchantIdentity.objects.get_or_create(merchant=merchant)
        # Ensure the merchant can be used for permission check
        identity.user = merchant.user
        return identity

    def perform_update(self, serializer):
        instance = serializer.save()

        front_uploaded  = 'id_document' in self.request.FILES
        back_uploaded   = 'id_document_back' in self.request.FILES
        selfie_uploaded = 'selfie_with_id' in self.request.FILES

        # If any document is uploaded, set the status to Pending Review
        if front_uploaded or back_uploaded or selfie_uploaded:
            instance.verification_status = "Pending"
            instance.face_match_status = "Pending"
            instance.warnings = []
            # We don't change id_document_verified here (it remains False until manually approved)
            instance.save()



@extend_schema(tags=["merchants"])
class MerchantTeamView(generics.ListCreateAPIView):
    """
    GET  /merchants/team/ - Invites you sent, or (if you have no account of
                            your own) the invites you have received
    POST /merchants/team/ - Invite someone to ONE of your stores
                            Body: {email, role, store_id}
    """
    serializer_class = MerchantStaffSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return MerchantStaff.objects.none()
        own = getattr(self.request.user, "merchant", None)
        if own is None:
            # A teammate has no team of their own. Answering with their
            # employer's roster — which get_active_merchant would have done —
            # hands them every other member's email address.
            return MerchantStaff.objects.filter(
                user=self.request.user
            ).select_related("store", "merchant")
        return MerchantStaff.objects.filter(merchant=own).select_related("store", "user")

    def create(self, request, *args, **kwargs):
        # Inviting is an account-level act, so it needs the caller's own
        # merchant. get_active_merchant would have resolved a teammate to
        # their employer and let them invite people onto someone else's shop.
        merchant = require_own_merchant(request.user)

        email = request.data.get("email")
        role = request.data.get("role", MerchantStaff.Role.MANAGER)
        store_id = request.data.get("store_id") or request.data.get("store")

        if not email:
            return Response({"error": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not store_id:
            return Response(
                {"error": "Choose which store to share."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if role not in MerchantStaff.Role.values:
            return Response({"error": "Unknown role."}, status=status.HTTP_400_BAD_REQUEST)

        # Scoped to the owner's own stores, so an owner cannot hand out access
        # to a shop that is merely shared with them.
        try:
            store = merchant.stores.filter(id=store_id).first()
        except (DjangoValidationError, ValueError):
            return Response({"error": "Not a valid store id."}, status=status.HTTP_400_BAD_REQUEST)
        if store is None:
            return Response({"error": "Store not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            user_to_invite = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {"error": "No Koraa account found with this email. They must register first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if user_to_invite == request.user:
            return Response({"error": "You cannot invite yourself."}, status=status.HTTP_400_BAD_REQUEST)

        # One row per person per store, so the same teammate can be invited
        # to a second shop without disturbing the first.
        staff, created = MerchantStaff.objects.get_or_create(
            merchant=merchant,
            user=user_to_invite,
            store=store,
            defaults={"role": role, "status": MerchantStaff.Status.PENDING},
        )

        if not created:
            if staff.status == MerchantStaff.Status.ACCEPTED:
                return Response(
                    {"error": f"{email} already has access to {store.name}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Re-send invite if previously rejected or still pending
            staff.role = role
            staff.status = MerchantStaff.Status.PENDING
            staff.save(update_fields=["role", "status"])

        # Create in-app notification for the invitee
        from apps.notifications.models import Notification
        Notification.objects.create(
            recipient=user_to_invite,
            sender=request.user,
            type=Notification.Type.TEAM_INVITE,
            title=f"You've been invited to help run {store.name}",
            body=(
                f"{request.user.full_name or request.user.email} has invited you to "
                f"manage {store.name} as {role}. Accept and the store appears in "
                f"your dashboard."
            ),
            data={
                "staff_id": str(staff.id),
                "merchant_id": str(merchant.id),
                "merchant_name": merchant.business_name,
                "store_id": str(store.id),
                "store_name": store.name,
                "role": role,
            },
        )

        return Response(
            MerchantStaffSerializer(staff).data, status=status.HTTP_201_CREATED
        )


@extend_schema(tags=["merchants"])
class MerchantTeamDetailView(generics.DestroyAPIView):
    """
    DELETE /merchants/team/<id>/ - Revoke a member or invite, or leave a team
    """
    queryset = MerchantStaff.objects.all()
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return MerchantStaff.objects.none()
        # Rows the caller may act on: those on their own account, plus their
        # own memberships, which they can drop to leave a team.
        scope = Q(user=self.request.user)
        own = getattr(self.request.user, "merchant", None)
        if own is not None:
            scope |= Q(merchant=own)
        return MerchantStaff.objects.filter(scope)

    def perform_destroy(self, instance):
        own = getattr(self.request.user, "merchant", None)
        is_owner = own is not None and instance.merchant_id == own.id
        if not is_owner and instance.user_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only the store owner can remove a team member.")
        instance.delete()


@extend_schema(tags=["merchants"])
class MerchantPayoutAccountListCreateView(generics.ListCreateAPIView):
    """
    GET  /merchants/payouts/ - List payout accounts
    POST /merchants/payouts/ - Add a payout account
    """
    serializer_class = MerchantPayoutAccountSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            from .models import MerchantPayoutAccount
            return MerchantPayoutAccount.objects.none()
        merchant = get_active_merchant(self.request.user)
        from .models import MerchantPayoutAccount
        return MerchantPayoutAccount.objects.filter(merchant=merchant)

    def perform_create(self, serializer):
        merchant = get_active_merchant(self.request.user)
        # If this is the first payout account, set it as default
        from .models import MerchantPayoutAccount
        is_default = not MerchantPayoutAccount.objects.filter(merchant=merchant).exists()
        serializer.save(merchant=merchant, is_default=is_default)


@extend_schema(tags=["merchants"])
class MerchantPayoutAccountDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET, PUT, PATCH, DELETE /merchants/payouts/<id>/
    """
    serializer_class = MerchantPayoutAccountSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            from .models import MerchantPayoutAccount
            return MerchantPayoutAccount.objects.none()
        merchant = get_active_merchant(self.request.user)
        from .models import MerchantPayoutAccount
        return MerchantPayoutAccount.objects.filter(merchant=merchant)



@extend_schema(
    tags=["merchants"],
    request={"application/json": {"type": "object", "properties": {
        "phone": {"type": "string", "example": "+237612345678"},
    }, "required": ["phone"]}},
    responses={200: {"type": "object", "properties": {"message": {"type": "string"}}}},
)
class PhoneSendOTPView(APIView):
    """
    POST /merchants/phone/send-otp/

    Send a 6-digit OTP via Camoo SMS to the supplied phone number.
    The OTP expires in 10 minutes. Call /merchants/phone/verify-otp/ to confirm.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth"

    def post(self, request):
        phone = (request.data.get("phone") or "").strip()
        if not phone:
            return Response({"error": "Phone number is required."}, status=status.HTTP_400_BAD_REQUEST)

        if not (phone.startswith("+") and phone[1:].isdigit() and len(phone) >= 8):
            return Response(
                {"error": "Phone number must be in E.164 format, e.g. +237612345678."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp, _ = PhoneVerificationOTP.generate(request.user, phone)
        message = (
            f"Your Koraa verification code is: {otp}. "
            "Valid for 10 minutes. Do not share it."
        )
        ok, _ = send_sms(to=phone, message=message)

        if not ok:
            return Response(
                {"error": "Could not send SMS. Please check the number and try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({"message": f"OTP sent to {phone}."})


@extend_schema(
    tags=["merchants"],
    request={"application/json": {"type": "object", "properties": {
        "phone": {"type": "string", "example": "+237612345678"},
        "otp":   {"type": "string", "example": "482910"},
    }, "required": ["phone", "otp"]}},
    responses={200: {"type": "object", "properties": {"message": {"type": "string"}}}},
)
class PhoneVerifyOTPView(APIView):
    """
    POST /merchants/phone/verify-otp/

    Confirm the OTP received by SMS. On success sets
    MerchantIdentity.phone_verified = True.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        phone   = (request.data.get("phone") or "").strip()
        raw_otp = (request.data.get("otp")   or "").strip()

        if not phone or not raw_otp:
            return Response(
                {"error": "Both 'phone' and 'otp' are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp_obj = (
            PhoneVerificationOTP.objects
            .filter(user=request.user, phone=phone, is_used=False)
            .order_by("-created_at")
            .first()
        )

        if not otp_obj or not otp_obj.verify(raw_otp):
            return Response(
                {"error": "Invalid or expired OTP. Please request a new code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            merchant = get_active_merchant(request.user)
            identity, _ = MerchantIdentity.objects.get_or_create(merchant=merchant)
            identity.phone_verified = True
            identity.save(update_fields=["phone_verified"])

            if not request.user.phone:
                request.user.phone = phone
                request.user.save(update_fields=["phone"])
        except Exception:
            pass

        return Response({"message": "Phone number verified successfully."})
