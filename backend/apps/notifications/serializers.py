"""Notifications serializers."""
from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id", "type", "title", "body", "data",
            "is_read", "sender_name", "created_at",
        ]
        read_only_fields = fields

    def get_sender_name(self, obj):
        if obj.sender:
            return obj.sender.full_name or obj.sender.email
        return None
