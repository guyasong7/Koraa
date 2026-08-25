"""Notifications views."""
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(generics.ListAPIView):
    """
    GET /api/v1/notifications/ — List all notifications for the authenticated user.
    """
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def mark_all_read(request):
    """POST /api/v1/notifications/mark-all-read/"""
    Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
    return Response({"detail": "All notifications marked as read."})


@api_view(["PATCH"])
@permission_classes([permissions.IsAuthenticated])
def mark_one_read(request, pk):
    """PATCH /api/v1/notifications/<id>/read/"""
    notif = get_object_or_404(Notification, pk=pk, recipient=request.user)
    notif.is_read = True
    notif.save(update_fields=["is_read"])
    return Response(NotificationSerializer(notif).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def respond_to_invite(request, pk):
    """
    POST /api/v1/notifications/<id>/respond/
    Body: { "action": "accept" | "reject" }

    Handles accepting or rejecting a team_invite notification.
    - accept: sets MerchantStaff.status = "accepted", notifies the owner
    - reject: sets MerchantStaff.status = "rejected", notifies the owner
    """
    notif = get_object_or_404(Notification, pk=pk, recipient=request.user, type="team_invite")
    action = request.data.get("action")

    if action not in ("accept", "reject"):
        return Response({"error": "action must be 'accept' or 'reject'."}, status=400)

    staff_id = notif.data.get("staff_id")
    if not staff_id:
        return Response({"error": "Invalid invite data."}, status=400)

    from apps.merchants.models import MerchantStaff
    try:
        staff = MerchantStaff.objects.select_related("store", "merchant").get(id=staff_id)
    except MerchantStaff.DoesNotExist:
        notif.is_read = True
        notif.save()
        return Response({"error": "Invite no longer exists."}, status=404)

    # Accepting is what grants access to the store, so the row being accepted
    # has to be the caller's own. The notification is already scoped to the
    # recipient, but staff_id is data rather than a foreign key: an owner who
    # revoked and re-invited, or any future path that writes this payload, must
    # not be able to make one person's click accept another person's invite.
    if staff.user_id != request.user.id:
        return Response({"error": "This invite is not yours to answer."}, status=403)

    # Name the shop, not the account — the invite is to one store.
    scope = staff.store.name if staff.store_id else notif.data.get("merchant_name", "a store")

    if action == "accept":
        staff.status = "accepted"
        staff.save(update_fields=["status"])
        notif.is_read = True
        notif.save(update_fields=["is_read"])

        # Notify the merchant owner
        Notification.objects.create(
            recipient=staff.merchant.user,
            sender=request.user,
            type=Notification.Type.TEAM_INVITE_ACCEPTED,
            title="Team invite accepted",
            body=f"{request.user.full_name or request.user.email} accepted your invitation to help run {scope}.",
            data={"staff_id": str(staff.id)},
        )
        return Response({"detail": f"Invite accepted. {scope} is now in your stores menu."})

    else:  # reject
        staff.status = "rejected"
        staff.save(update_fields=["status"])
        notif.is_read = True
        notif.save(update_fields=["is_read"])

        # Notify the merchant owner
        Notification.objects.create(
            recipient=staff.merchant.user,
            sender=request.user,
            type=Notification.Type.TEAM_INVITE_REJECTED,
            title="Team invite declined",
            body=f"{request.user.full_name or request.user.email} declined your invitation to help run {scope}.",
            data={"staff_id": str(staff.id)},
        )
        return Response({"detail": "Invite declined."})
