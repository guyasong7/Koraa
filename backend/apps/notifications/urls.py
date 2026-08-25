"""Notifications URLs."""
from django.urls import path
from .views import (
    NotificationListView,
    mark_all_read,
    mark_one_read,
    respond_to_invite,
)

urlpatterns = [
    path("", NotificationListView.as_view(), name="notifications-list"),
    path("mark-all-read/", mark_all_read, name="notifications-mark-all-read"),
    path("<uuid:pk>/read/", mark_one_read, name="notifications-mark-one-read"),
    path("<uuid:pk>/respond/", respond_to_invite, name="notifications-respond"),
]
