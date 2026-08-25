"""Notification URL config."""

from __future__ import annotations

from django.urls import path

from .views import NotificationPreferencesView, NotificationRoutingView, NotificationViewSet

notification_list = NotificationViewSet.as_view({"get": "list"})
notification_read = NotificationViewSet.as_view({"patch": "mark_read"})
notification_read_all = NotificationViewSet.as_view({"post": "read_all"})
notification_unread_count = NotificationViewSet.as_view({"get": "unread_count"})
notification_dismiss = NotificationViewSet.as_view({"delete": "dismiss"})
notification_clear_all = NotificationViewSet.as_view({"post": "clear_all"})

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
        "notifications/unread-count",
        notification_unread_count,
        name="notification-unread-count",
    ),
    path(
        "notifications/clear-all",
        notification_clear_all,
        name="notification-clear-all",
    ),
    path(
        "notifications/<int:pk>",
        notification_dismiss,
        name="notification-dismiss",
    ),
    path(
        "notifications/preferences",
        NotificationPreferencesView.as_view(),
        name="notification-preferences",
    ),
    path(
        "org/notification-routing/",
        NotificationRoutingView.as_view(),
        name="notification-routing",
    ),
]
