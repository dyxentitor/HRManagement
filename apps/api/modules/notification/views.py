"""Notification views."""

from __future__ import annotations

from typing import ClassVar

from django.db import transaction
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet

from common.audit.service import append as audit_append
from common.feature_flags.decorators import requires_feature
from modules.identity.permissions import HRMSPermission

from .models import Notification, NotificationPreference, NotificationRouting
from .serializers import (
    NotificationPreferenceSerializer,
    NotificationRoutingRowSerializer,
    NotificationRoutingWriteSerializer,
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

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "limit", OpenApiTypes.INT, description="Max rows (default 20, cap 50)"
            ),
            OpenApiParameter(
                "unread_only", OpenApiTypes.BOOL, description="Only unread when 'true'"
            ),
            OpenApiParameter(
                "before", OpenApiTypes.INT, description="Return rows with id < before (cursor)"
            ),
        ]
    )
    def list(self, request: Request) -> Response:
        qs = self.get_queryset()
        if request.query_params.get("unread_only") == "true":
            qs = qs.filter(read_at__isnull=True)
        before = request.query_params.get("before")
        if before:
            try:
                qs = qs.filter(id__lt=int(before))
            except ValueError:
                pass
        try:
            limit = int(request.query_params.get("limit", 20))
        except ValueError:
            limit = 20
        limit = max(1, min(limit, 50))
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

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request: Request) -> Response:
        count = Notification.objects.filter(
            user=request.user, channel="in_app", read_at__isnull=True
        ).count()
        return Response({"count": count})

    @action(detail=True, methods=["delete"], url_path="")
    def dismiss(self, request: Request, pk=None) -> Response:
        """Hard-delete the caller's own in-app notification (Teams-style clear)."""
        Notification.objects.filter(user=request.user, channel="in_app", pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="clear-all")
    def clear_all(self, request: Request) -> Response:
        """Hard-delete all the caller's in-app notifications (read + unread)."""
        deleted, _ = Notification.objects.filter(user=request.user, channel="in_app").delete()
        return Response({"cleared": deleted})


@requires_feature("notifications")
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


class NotificationRoutingView(APIView):
    """Org-level notification routing — enablement, delivery lane, CC recipients."""

    permission_classes: ClassVar[list] = [HRMSPermission]

    @property
    def required_perms(self):
        if self.request.method == "GET":
            return ["org:email_config:read"]
        return ["org:email_config:write"]

    def _rows(self, org_id):
        from .registry import REGISTRY, domain_label, domain_of
        from .services.routing import available_tokens, routing_for

        out = []
        for n in REGISTRY:
            r = routing_for(org_id, n.type)
            out.append(
                {
                    "type": n.type,
                    "label": n.label,
                    "domain": domain_of(n.type),
                    "domain_label": domain_label(n.type),
                    "security": n.security,
                    "sensitive_content": n.sensitive_content,
                    "in_app_enabled": r.in_app_enabled,
                    "email_enabled": r.email_enabled,
                    "delivery": r.delivery,
                    "cc_entries": list(r.cc_entries or []),
                    "available_tokens": available_tokens(n.type),
                }
            )
        return out

    @extend_schema(responses=NotificationRoutingRowSerializer(many=True))
    def get(self, request: Request) -> Response:
        return Response(
            NotificationRoutingRowSerializer(self._rows(request.user.org_id), many=True).data
        )

    @extend_schema(
        request=NotificationRoutingWriteSerializer(many=True),
        responses=NotificationRoutingRowSerializer(many=True),
    )
    def put(self, request: Request) -> Response:
        ser = NotificationRoutingWriteSerializer(data=request.data, many=True)
        ser.is_valid(raise_exception=True)
        org_id = request.user.org_id

        with transaction.atomic():
            for item in ser.validated_data:
                NotificationRouting.objects.update_or_create(
                    org_id=org_id,
                    type=item["type"],
                    defaults={
                        "in_app_enabled": item["in_app_enabled"],
                        "email_enabled": item["email_enabled"],
                        "delivery": item["delivery"],
                        "cc_entries": item["cc_entries"],
                        "updated_by": request.user,
                    },
                )

        audit_append(
            org_id=org_id,
            action="notification_routing.updated",
            entity="notification_routing",
            entity_id=org_id,
            after={"types": [i["type"] for i in ser.validated_data]},
        )
        return Response(NotificationRoutingRowSerializer(self._rows(org_id), many=True).data)
