"""Onboarding invitation endpoints — HR management + public activation."""

from __future__ import annotations

from typing import ClassVar

from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from common.audit.models import AuditLog

from .models import Invitation
from .permissions import HRMSPermission
from .serializers_invitation import (
    InvitationActivateSerializer,
    InvitationExtendSerializer,
    InvitationSerializer,
)
from .services import invitation as inv_service
from .views import _client_ip


class InvitationViewSet(viewsets.ReadOnlyModelViewSet):
    """HR view of invitations + lifecycle actions (resend / revoke / extend)."""

    serializer_class = InvitationSerializer
    permission_classes: ClassVar = [HRMSPermission]
    required_perms: ClassVar = ["user:create"]

    def get_queryset(self):
        return Invitation.objects.filter(org_id=self.request.user.org_id).select_related("user")

    @action(detail=True, methods=["post"])
    def resend(self, request, pk=None):
        inv = self.get_object()
        inv_service.resend(inv, by=request.user.id)
        return Response(self.get_serializer(inv).data)

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        inv = self.get_object()
        inv_service.revoke(inv, by=request.user.id)
        return Response(self.get_serializer(inv).data)

    @action(detail=True, methods=["post"])
    def extend(self, request, pk=None):
        inv = self.get_object()
        s = InvitationExtendSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        inv_service.extend(inv, hours=s.validated_data["hours"], by=request.user.id)
        return Response(self.get_serializer(inv).data)

    @action(detail=True, methods=["post"], url_path="copy-link")
    def copy_link(self, request, pk=None):
        inv = self.get_object()
        raw = inv_service.regenerate_link(inv, by=request.user.id)
        return Response({"link": inv_service.build_activation_link(raw)})

    @action(detail=True, methods=["get"])
    def activity(self, request, pk=None):
        inv = self.get_object()
        rows = AuditLog.objects.filter(
            org_id=request.user.org_id,
            entity="invitation",
            entity_id=inv.id,
        ).order_by("ts")
        return Response(
            [
                {
                    "action": r.action,
                    "ts": r.ts.isoformat(),
                    "after": r.after,
                    "ip": r.ip,
                    "user_agent": r.user_agent,
                    "actor_id": str(r.actor_id) if r.actor_id else None,
                }
                for r in rows
            ]
        )


@api_view(["GET"])
@permission_classes([AllowAny])
def invitation_verify_view(request) -> Response:
    """Public: validate an activation token (marks it opened) for the landing page."""
    token = request.query_params.get("token", "")
    inv = inv_service.verify(
        token,
        ip=_client_ip(request) or "",
        ua=request.META.get("HTTP_USER_AGENT", ""),
    )
    from .serializers_invitation import _emp_for_user

    emp = _emp_for_user(inv.user_id)
    return Response(
        {
            "full_name": emp.full_name if emp else inv.user.email,
            "email": inv.user.email,
            "org_name": inv_service._org_name(inv.org_id),
            "expires_at": inv.expires_at.isoformat(),
            "status": inv.effective_status,
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def invitation_activate_view(request) -> Response:
    """Public: set the password for an invited account, activate it, and sign in.

    Returns JWTs so the onboarding wizard can continue authenticated (Phase 2),
    and seeds the onboarding progress so the post-login gate can resume it.
    """
    from .services.auth import _issue_tokens
    from .services.sessions import create_session

    s = InvitationActivateSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    user = inv_service.activate(
        s.validated_data["token"],
        password=s.validated_data["password"],
        ip=_client_ip(request) or "",
    )

    prefs = dict(user.preferences or {})
    prefs["onboarding"] = {"completed": False, "step": "profile"}
    user.preferences = prefs
    user.save(update_fields=["preferences", "updated_at"])

    access, refresh = _issue_tokens(user)
    create_session(
        user,
        refresh_token=refresh,
        ip=_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
    )
    return Response(
        {"access_token": access, "refresh_token": refresh},
        status=status.HTTP_200_OK,
    )
