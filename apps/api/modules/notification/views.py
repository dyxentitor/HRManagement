"""Notification views."""

from __future__ import annotations

from typing import ClassVar

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet

from common.feature_flags.decorators import requires_feature

from .models import Notification, NotificationPreference
from .serializers import (
    NotificationPreferenceSerializer,
    NotificationSerializer,
    PreferenceBulkUpdateItemSerializer,
)
from .services.preferences import SECURITY_TYPES


@requires_feature("notifications")
class NotificationViewSet(GenericViewSet):
    """List, mark-read, mark-all-read for own notifications."""

    permission_classes: ClassVar[list] = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user, channel="in_app").order_by(
            "-created_at"
        )

    def list(self, request: Request) -> Response:
        qs = self.get_queryset()
        if request.query_params.get("unread_only") == "true":
            qs = qs.filter(read_at__isnull=True)
        limit = int(request.query_params.get("limit", 50))
        qs = qs[:limit]
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["patch"], url_path="read")
    def mark_read(self, request: Request, pk=None) -> Response:
        n = self.get_object()
        n.mark_read()
        return Response(NotificationSerializer(n).data)

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request: Request) -> Response:
        updated = Notification.objects.filter(
            user=request.user, channel="in_app", read_at__isnull=True
        ).update(read_at=timezone.now())
        return Response({"updated": updated})


class NotificationPreferencesView(APIView):
    """GET + PATCH own notification preferences."""

    permission_classes: ClassVar[list] = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        prefs = NotificationPreference.objects.filter(user=request.user)
        return Response(NotificationPreferenceSerializer(prefs, many=True).data)

    def patch(self, request: Request) -> Response:
        items_serializer = PreferenceBulkUpdateItemSerializer(data=request.data, many=True)
        items_serializer.is_valid(raise_exception=True)
        updated = []
        for item in items_serializer.validated_data:
            type_code = item["type"]
            channel = item["channel"]
            enabled = item["enabled"]
            # Security-relevant types cannot be disabled
            if type_code in SECURITY_TYPES and not enabled:
                continue
            pref, _ = NotificationPreference.objects.update_or_create(
                user=request.user,
                type=type_code,
                channel=channel,
                defaults={"enabled": enabled},
            )
            updated.append(pref)
        return Response(
            NotificationPreferenceSerializer(updated, many=True).data,
            status=status.HTTP_200_OK,
        )
