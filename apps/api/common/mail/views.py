from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit.service import append as audit_append
from common.mail import service
from common.mail.serializers import (
    EmailConfigurationSerializer,
    EmailConfigWriteSerializer,
    SendTestEmailSerializer,
    TestConnectionSerializer,
)
from modules.identity.permissions import HRMSPermission
from modules.identity.services.permissions import get_user_perms


class EmailConfigView(APIView):
    permission_classes: ClassVar = [HRMSPermission]

    @property
    def required_perms(self):
        if self.request.method == "GET":
            return ["org:email_config:read"]
        return ["org:email_config:write"]

    @extend_schema(responses=EmailConfigurationSerializer)
    def get(self, request):
        cfg = service.get_or_create_config(request.user.org_id)
        return Response(EmailConfigurationSerializer(cfg).data)

    @extend_schema(request=EmailConfigWriteSerializer, responses=EmailConfigurationSerializer)
    def patch(self, request):
        cfg = service.get_or_create_config(request.user.org_id)
        ser = EmailConfigWriteSerializer(cfg, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        changed = [f for f in ser.validated_data if f != "smtp_password"]
        if ser.validated_data.get("smtp_password"):
            changed.append("smtp_password")
        ser.save(updated_by=request.user)
        if changed:
            audit_append(
                org_id=request.user.org_id,
                action="email_config.updated",
                entity="email_config",
                entity_id=cfg.id,
                after={"changed_fields": changed},
            )
        cfg.refresh_from_db()
        return Response(EmailConfigurationSerializer(cfg).data)


def _require_write(user) -> bool:
    return "org:email_config:write" in get_user_perms(user)


@extend_schema(request=TestConnectionSerializer, responses=dict)
@api_view(["POST"])
@permission_classes([HRMSPermission])
def test_connection_view(request):
    if not _require_write(request.user):
        return Response({"detail": "Permission denied"}, status=403)
    ser = TestConnectionSerializer(data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    result = service.run_connection_test(request.user.org_id, ser.validated_data)
    audit_append(
        org_id=request.user.org_id,
        action="email_config.tested",
        entity="email_config",
        entity_id=service.get_or_create_config(request.user.org_id).id,
        after={"success": result["success"]},
    )
    return Response(result)


@extend_schema(request=SendTestEmailSerializer, responses=dict)
@api_view(["POST"])
@permission_classes([HRMSPermission])
def send_test_email_view(request):
    if not _require_write(request.user):
        return Response({"detail": "Permission denied"}, status=403)
    ser = SendTestEmailSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    recipient = ser.validated_data.pop("recipient")
    result = service.send_test_email(request.user.org_id, recipient, ser.validated_data)
    audit_append(
        org_id=request.user.org_id,
        action="email_config.test_email_sent",
        entity="email_config",
        entity_id=service.get_or_create_config(request.user.org_id).id,
        after={"recipient": recipient, "success": result["success"]},
    )
    return Response(result)
