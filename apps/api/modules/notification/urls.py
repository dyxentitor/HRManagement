"""Notification URL config."""

from __future__ import annotations

from django.urls import path

from .views import NotificationPreferencesView, NotificationViewSet

notification_list = NotificationViewSet.as_view({"get": "list"})
notification_read = NotificationViewSet.as_view({"patch": "mark_read"})
notification_read_all = NotificationViewSet.as_view({"post": "read_all"})

urlpatterns = [
    path("notifications", notification_list, name="notification-list"),
    path(
        "notifications/<int:pk>/read",
        notification_read,
        name="notification-read",
    ),
    path(
        "notifications/read-all",
        notification_read_all,
        name="notification-read-all",
    ),
    path(
        "notifications/preferences",
        NotificationPreferencesView.as_view(),
        name="notification-preferences",
    ),
]
