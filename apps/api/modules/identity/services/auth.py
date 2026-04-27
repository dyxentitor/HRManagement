"""Authentication services — login, refresh, password reset."""

from __future__ import annotations

import secrets

from django.conf import settings
from django.core.cache import cache
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from modules.identity.models import User

from .sessions import create_session, revoke_all_user_sessions, revoke_session_by_token


def _issue_tokens(user: User) -> tuple[str, str]:
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


def login(email: str, password: str, ip: str | None, user_agent: str) -> dict:
    """Authenticate and issue tokens. Records session, increments failed_login_count on miss.

    Returns:
        {access_token, refresh_token, mfa_required: bool}
    """
    # Fetch user case-insensitively (USERNAME_FIELD email is unique per-org)
    user = User.objects.filter(email__iexact=email, is_active=True, status="active").first()

    if not user or not user.check_password(password):
        if user:
            user.failed_login_count = (user.failed_login_count or 0) + 1
            user.save(update_fields=["failed_login_count", "updated_at"])
        from rest_framework.exceptions import AuthenticationFailed

        raise AuthenticationFailed("Invalid email or password")

    if user.status != "active":
        from rest_framework.exceptions import AuthenticationFailed

        raise AuthenticationFailed("Account is not active")

    user.failed_login_count = 0
    user.last_login_at = timezone.now()
    user.last_login_ip = ip
    user.save(update_fields=["failed_login_count", "last_login_at", "last_login_ip", "updated_at"])

    if user.mfa_enabled:
        # Generate a short-lived MFA challenge token (NOT a JWT; stored in cache).
        mfa_token = secrets.token_urlsafe(32)
        cache.set(f"mfa_challenge:{mfa_token}", str(user.id), timeout=300)
        return {
            "access_token": "",
            "refresh_token": "",
            "mfa_required": True,
            "mfa_token": mfa_token,
        }

    access, refresh = _issue_tokens(user)
    create_session(user, refresh_token=refresh, ip=ip, user_agent=user_agent)
    return {"access_token": access, "refresh_token": refresh, "mfa_required": False}


def refresh_tokens(refresh_token: str, ip: str | None, user_agent: str) -> dict:
    """Rotate refresh token. Revokes the old session, creates a new one."""
    from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

    try:
        old = RefreshToken(refresh_token)
    except TokenError as exc:
        raise InvalidToken from exc

    user_id = old["user_id"]
    user = User.objects.get(id=user_id)
    new_refresh = RefreshToken.for_user(user)
    revoke_session_by_token(refresh_token)
    create_session(user, refresh_token=str(new_refresh), ip=ip, user_agent=user_agent)
    return {"access_token": str(new_refresh.access_token), "refresh_token": str(new_refresh)}


def logout(refresh_token: str) -> None:
    """Revoke the session for the given refresh token."""
    revoke_session_by_token(refresh_token)


def initiate_password_reset(email: str) -> None:
    """If a user with this email exists, send them a reset link.

    Always silent on unknown emails to avoid leaking enrolment.
    """
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if not user:
        return
    token = secrets.token_urlsafe(32)
    cache.set(f"pwreset:{token}", str(user.id), timeout=3600)  # 1 hour
    send_mail(
        subject="HRMS — Password reset",
        message=(
            f"Use this token to reset your password.\n\n"
            f"token: {token}\n\n"
            "If you did not request this, ignore this email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


def complete_password_reset(token: str, new_password: str) -> None:
    user_id = cache.get(f"pwreset:{token}")
    if not user_id:
        from rest_framework.exceptions import ValidationError

        raise ValidationError({"token": "invalid or expired"})
    user = User.objects.get(id=user_id)
    user.set_password(new_password)
    user.save(update_fields=["password", "updated_at"])
    cache.delete(f"pwreset:{token}")
    revoke_all_user_sessions(user)
