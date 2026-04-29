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
    return Response({"access_token": str(refresh.access_token), "refresh_token": str(refresh)})
