"""Auth endpoints."""

from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .serializers import (
    LoginSerializer,
    LogoutSerializer,
    MeSerializer,
    PasswordChangeSerializer,
    PasswordForgotSerializer,
    PasswordResetSerializer,
    RefreshSerializer,
)
from .services.auth import (
    complete_password_reset,
    initiate_password_reset,
    refresh_tokens,
)
from .services.auth import (
    login as login_service,
)
from .services.auth import (
    logout as logout_service,
)


def _client_ip(request) -> str | None:
    fwd = request.META.get("HTTP_X_FORWARDED_FOR")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _ua(request) -> str:
    return request.META.get("HTTP_USER_AGENT", "")


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request) -> Response:
    s = LoginSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    result = login_service(
        email=s.validated_data["email"],
        password=s.validated_data["password"],
        ip=_client_ip(request),
        user_agent=_ua(request),
    )
    return Response(result)


@api_view(["POST"])
@permission_classes([AllowAny])
def refresh_view(request) -> Response:
    s = RefreshSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    result = refresh_tokens(
        refresh_token=s.validated_data["refresh_token"],
        ip=_client_ip(request),
        user_agent=_ua(request),
    )
    return Response(result)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request) -> Response:
    s = LogoutSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    logout_service(refresh_token=s.validated_data["refresh_token"])
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_view(request) -> Response:
    return Response(MeSerializer(request.user).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def me_preferences_view(request) -> Response:
    """Merge-update the caller's own preferences (theme/locale/timezone/onboarding…).

    The nested `onboarding` object is shallow-merged so a single field (e.g. the
    current step) can be updated without clobbering the rest.
    """
    user = request.user
    prefs = dict(user.preferences or {})
    body = request.data if isinstance(request.data, dict) else {}
    for key, value in body.items():
        nested = key == "onboarding" and isinstance(value, dict)
        if nested and isinstance(prefs.get("onboarding"), dict):
            prefs["onboarding"] = {**prefs["onboarding"], **value}
        else:
            prefs[key] = value
    user.preferences = prefs
    user.save(update_fields=["preferences", "updated_at"])
    return Response(prefs)


@api_view(["POST"])
@permission_classes([AllowAny])
def password_forgot_view(request) -> Response:
    s = PasswordForgotSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    initiate_password_reset(email=s.validated_data["email"])
    return Response({"detail": "If an account exists, a reset email has been sent."})


@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_view(request) -> Response:
    s = PasswordResetSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    complete_password_reset(
        token=s.validated_data["token"],
        new_password=s.validated_data["new_password"],
    )
    return Response({"detail": "Password updated."})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def password_change_view(request) -> Response:
    s = PasswordChangeSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    from modules.identity.services.auth import change_own_password

    change_own_password(user=request.user, new_password=s.validated_data["new_password"])
    return Response({"detail": "Password updated."})


from .serializers import LoginMFASerializer, MFAConfirmSerializer  # noqa: E402
from .services import mfa as mfa_service  # noqa: E402
from .services.sessions import create_session  # noqa: E402


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mfa_enable_view(request) -> Response:
    return Response(mfa_service.enable(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mfa_confirm_view(request) -> Response:
    s = MFAConfirmSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    if not mfa_service.confirm(request.user, s.validated_data["code"]):
        from rest_framework.exceptions import ValidationError

        raise ValidationError({"code": "Invalid TOTP code"})
    return Response({"detail": "MFA enabled."})


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def mfa_disable_view(request) -> Response:
    mfa_service.disable(request.user)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def revoke_all_sessions_view(request) -> Response:
    from .services.sessions import revoke_all_user_sessions

    count = revoke_all_user_sessions(request.user)
    return Response({"revoked": count})


@api_view(["POST"])
@permission_classes([AllowAny])
def login_mfa_view(request) -> Response:
    s = LoginMFASerializer(data=request.data)
    s.is_valid(raise_exception=True)
    user = mfa_service.verify_login_mfa(
        mfa_token=s.validated_data["mfa_token"],
        code=s.validated_data["code"],
    )
    if user is None:
        from rest_framework.exceptions import AuthenticationFailed

        raise AuthenticationFailed("Invalid MFA token or code")

    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(user)
    create_session(
        user,
        refresh_token=str(refresh),
        ip=_client_ip(request),
        user_agent=_ua(request),
    )
    return Response(
        {
            "access_token": str(refresh.access_token),
            "refresh_token": str(refresh),
            "must_change_password": user.must_change_password,
        }
    )


# --- Admin: role admin endpoints (Feature 2) -----------------------------

from typing import ClassVar  # noqa: E402

from rest_framework import viewsets  # noqa: E402

from modules.identity.models import Role  # noqa: E402
from modules.identity.permissions import HRMSPermission  # noqa: E402
from modules.identity.serializers import (  # noqa: E402
    RoleDetailSerializer,
    RoleListItemSerializer,
    RolePermissionsInputSerializer,
)
from modules.identity.services.permissions import (  # noqa: E402
    LastWritePermissionHolderError,
    OrgAdminProtectionError,
    UnknownPermissionError,
    UnknownRoleError,
    get_user_perms,
    reset_role_to_defaults,
    set_role_permissions,
)


class RoleViewSet(viewsets.ReadOnlyModelViewSet):
    """List + retrieve roles in the actor's org."""

    permission_classes: ClassVar = [HRMSPermission]
    required_perms: ClassVar = ["role:read"]
    lookup_field = "code"

    def get_queryset(self):
        return Role.objects.filter(org_id=self.request.user.org_id).order_by("code")

    def get_serializer_class(self):
        if self.action == "list":
            return RoleListItemSerializer
        return RoleDetailSerializer


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def role_permissions_view(request, code: str) -> Response:
    """PATCH /api/v1/roles/{code}/permissions/

    Body: {"permission_codes": ["...", "..."]}
    """
    if "role:write" not in get_user_perms(request.user):
        return Response({"detail": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

    serializer = RolePermissionsInputSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        set_role_permissions(
            actor=request.user,
            role_code=code,
            permission_codes=serializer.validated_data["permission_codes"],
        )
    except Role.DoesNotExist:
        return Response(
            {"detail": f"Role '{code}' not found"},
            status=status.HTTP_404_NOT_FOUND,
        )
    except UnknownPermissionError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except OrgAdminProtectionError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except LastWritePermissionHolderError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    role = Role.objects.get(org_id=request.user.org_id, code=code)
    return Response(RoleDetailSerializer(role).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def role_reset_view(request, code: str) -> Response:
    """POST /api/v1/roles/{code}/reset-to-defaults/"""
    if "role:write" not in get_user_perms(request.user):
        return Response({"detail": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

    try:
        reset_role_to_defaults(actor=request.user, role_code=code)
    except UnknownRoleError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
    except Role.DoesNotExist:
        return Response(
            {"detail": f"Role '{code}' not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    role = Role.objects.get(org_id=request.user.org_id, code=code)
    return Response(RoleDetailSerializer(role).data)


from modules.identity.models import User as UserModel  # noqa: E402
from modules.identity.models import UserRole  # noqa: E402
from modules.identity.serializers import AssignRolesInputSerializer  # noqa: E402
from modules.identity.services.permissions import (  # noqa: E402
    LastAdminError,
    SelfDemoteError,
    assign_roles_to_user,
)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def assign_user_roles_view(request, user_id: str) -> Response:
    """PATCH /api/v1/users/{user_id}/roles/

    Body: {"role_codes": ["manager", "team_lead"]}
    """
    if "role:write" not in get_user_perms(request.user):
        return Response({"detail": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

    serializer = AssignRolesInputSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        target = UserModel.objects.get(id=user_id, org_id=request.user.org_id)
    except UserModel.DoesNotExist:
        return Response({"detail": "User not found"}, status=status.HTTP_404_NOT_FOUND)

    try:
        assign_roles_to_user(
            actor=request.user,
            target=target,
            role_codes=serializer.validated_data["role_codes"],
        )
    except UnknownRoleError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except SelfDemoteError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except LastAdminError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    role_codes = list(
        UserRole.objects.filter(user=target)
        .values_list("role__code", flat=True)
        .order_by("role__code"),
    )
    return Response(
        {
            "user_id": str(target.id),
            "email": target.email,
            "role_codes": role_codes,
            "permissions": sorted(get_user_perms(target)),
        }
    )
