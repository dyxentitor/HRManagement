"""Account lifecycle endpoints — detail, soft-delete, disable/enable, restore.

All org-scoped and gated via HRMSPermission. A user may not disable or delete
their own account (self-lockout guard). Every mutation writes an audit row.
"""

from __future__ import annotations

from typing import ClassVar

from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit.service import append as audit_append
from modules.identity.models import User
from modules.identity.permissions import HRMSPermission
from modules.identity.serializers import UserAccountSerializer


def _get_target(request, user_id) -> User:
    user = User.objects.filter(org_id=request.user.org_id, id=user_id).first()
    if user is None:
        raise NotFound("User not found.")
    return user


def _guard_not_self(request, target) -> None:
    if target.id == request.user.id:
        raise ValidationError("You can't disable or delete your own account.")


class UserDetailView(APIView):
    permission_classes: ClassVar = [HRMSPermission]

    @property
    def required_perms(self):
        return ["user:delete"] if self.request.method == "DELETE" else ["user:read:org"]

    def get(self, request, user_id):
        return Response(UserAccountSerializer(_get_target(request, user_id)).data)

    def delete(self, request, user_id):
        target = _get_target(request, user_id)
        _guard_not_self(request, target)
        target.soft_delete()
        audit_append(
            org_id=request.user.org_id,
            action="user.deleted",
            entity="user",
            entity_id=target.id,
            after={"deleted_at": str(target.deleted_at)},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class _LifecycleView(APIView):
    permission_classes: ClassVar = [HRMSPermission]
    required_perms: ClassVar = ["user:disable"]
    audit_action: ClassVar = ""

    def _apply(self, target) -> None:  # pragma: no cover - overridden
        raise NotImplementedError

    def post(self, request, user_id):
        target = _get_target(request, user_id)
        _guard_not_self(request, target)
        self._apply(target)
        audit_append(
            org_id=request.user.org_id,
            action=self.audit_action,
            entity="user",
            entity_id=target.id,
            after={"status": target.status, "is_active": target.is_active},
        )
        return Response(UserAccountSerializer(target).data)


class UserDisableView(_LifecycleView):
    required_perms: ClassVar = ["user:disable"]
    audit_action: ClassVar = "user.disabled"

    def _apply(self, target):
        target.status = "disabled"
        target.is_active = False
        target.save(update_fields=["status", "is_active", "updated_at"])


class UserEnableView(_LifecycleView):
    required_perms: ClassVar = ["user:disable"]
    audit_action: ClassVar = "user.enabled"

    def _apply(self, target):
        target.status = "active"
        target.is_active = True
        target.save(update_fields=["status", "is_active", "updated_at"])


class UserRestoreView(_LifecycleView):
    required_perms: ClassVar = ["user:delete"]
    audit_action: ClassVar = "user.restored"

    def _apply(self, target):
        target.deleted_at = None
        target.is_active = True
        target.status = "active"
        target.save(update_fields=["deleted_at", "is_active", "status", "updated_at"])
