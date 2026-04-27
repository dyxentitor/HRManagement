# HRMS M1b-2 — Auth Endpoints + MFA + Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire JWT-based authentication on top of the M1b-1 user model. Add login (with MFA challenge step), refresh, logout, password reset, `/me`, MFA enable/confirm/delete, and a `Session` model for refresh-token rotation tracking. After this plan, a user can `POST /api/v1/auth/login` and receive an access+refresh token pair, optionally complete a TOTP MFA challenge, and use the access token for authenticated requests.

**Architecture:** Use `djangorestframework-simplejwt` for token issuance and rotation (already added in M1b-1). Sessions are tracked in our own `Session` table indexed by refresh-token-hash so we can server-side revoke (e.g., on password change). MFA uses TOTP (`pyotp`); secrets are stored encrypted via the `EncryptedCharField` from M1a-T1.

**Tech Stack:** Same as M1b-1 — `djangorestframework-simplejwt`, `pyotp`, `argon2-cffi`, `cryptography`. Adding password-reset email infra: `django.core.mail` (using `mailhog` SMTP in dev).

**Spec reference:** `docs/superpowers/specs/2026-04-27-hrms-design.md` §3 (`mfa_devices`, `sessions`), §4 (auth endpoints).

**Branch:** `m1/identity-rbac` (current). Do NOT switch.

---

## File structure (created/modified in this plan)

```
apps/api/
├── modules/identity/
│   ├── models.py                            ← + MFADevice, Session
│   ├── serializers.py                       ← NEW
│   ├── views.py                             ← NEW (auth views)
│   ├── urls.py                              ← NEW
│   ├── services/                            ← NEW package
│   │   ├── __init__.py
│   │   ├── auth.py                          ← Login, refresh, password-reset orchestration
│   │   ├── mfa.py                           ← TOTP enable/confirm/verify
│   │   └── sessions.py                      ← Session creation, revocation
│   ├── tests/
│   │   ├── test_auth_endpoints.py
│   │   ├── test_mfa.py
│   │   └── test_sessions.py
│   └── migrations/0003_*.py                 (auto-generated for MFADevice + Session)
└── hrms_api/urls.py                         ← include identity.urls under /api/v1/auth/
```

---

## Conventions

Same as M1b-1: working dir `/home/universal/Claude/HR_Management/`, branch `m1/identity-rbac`, per-command identity, TDD discipline, `# pragma: allowlist secret` for false-positive secret detections.

---

## Task 1: Sessions table + auth services skeleton

**Files:**
- Modify: `apps/api/modules/identity/models.py` (add `Session`)
- Create: `apps/api/modules/identity/services/__init__.py`
- Create: `apps/api/modules/identity/services/sessions.py`
- Create: `apps/api/modules/identity/tests/test_sessions.py`

- [ ] **Step 1: Write failing tests for Session**

Create `apps/api/modules/identity/tests/test_sessions.py`:

```python
"""Tests for the Session model + sessions service."""
import hashlib
import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from modules.identity.models import Session, User
from modules.identity.services.sessions import (
    create_session,
    revoke_session,
    revoke_all_user_sessions,
)


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def user(org_id: uuid.UUID) -> User:
    return User.objects.create_user(email="u@example.com", password="x", org_id=org_id)  # pragma: allowlist secret


@pytest.mark.django_db
def test_session_created_with_refresh_token_hash(user: User) -> None:
    refresh = "test.refresh.token"  # pragma: allowlist secret
    s = create_session(user, refresh_token=refresh, ip="127.0.0.1", user_agent="pytest")
    assert s.user == user
    expected_hash = hashlib.sha256(refresh.encode()).hexdigest()
    assert s.refresh_token_hash == expected_hash
    assert s.revoked_at is None


@pytest.mark.django_db
def test_revoke_session_stamps_revoked_at(user: User) -> None:
    s = create_session(user, refresh_token="t", ip="1.1.1.1", user_agent="x")
    revoke_session(s.id)
    s.refresh_from_db()
    assert s.revoked_at is not None


@pytest.mark.django_db
def test_revoke_all_user_sessions(user: User, org_id: uuid.UUID) -> None:
    other_user = User.objects.create_user(email="o@example.com", password="x", org_id=org_id)  # pragma: allowlist secret
    s1 = create_session(user, refresh_token="t1", ip="1.1.1.1", user_agent="x")
    s2 = create_session(user, refresh_token="t2", ip="1.1.1.1", user_agent="x")
    s3 = create_session(other_user, refresh_token="t3", ip="1.1.1.1", user_agent="x")

    revoke_all_user_sessions(user)

    s1.refresh_from_db(); s2.refresh_from_db(); s3.refresh_from_db()
    assert s1.revoked_at is not None
    assert s2.revoked_at is not None
    assert s3.revoked_at is None  # different user


@pytest.mark.django_db
def test_session_expires_at_set(user: User) -> None:
    s = create_session(user, refresh_token="t", ip="1.1.1.1", user_agent="x")
    delta = s.expires_at - timezone.now()
    # Default REFRESH_TOKEN_LIFETIME is 7 days per SIMPLE_JWT settings
    assert timedelta(days=6) < delta < timedelta(days=8)
```

- [ ] **Step 2: Run failing tests — expect import errors**

```
cd apps/api && uv run pytest modules/identity/tests/test_sessions.py -v 2>&1 | tail -10; cd ../..
```

- [ ] **Step 3: Add `Session` to `apps/api/modules/identity/models.py`**

Append:

```python
class Session(models.Model):
    """Tracks issued refresh tokens for server-side revocation.

    `refresh_token_hash` is the sha256 of the refresh JWT; storing the hash
    means the raw token never sits in the DB.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        "identity.User", on_delete=models.CASCADE, related_name="sessions"
    )
    refresh_token_hash = models.CharField(max_length=64, db_index=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "identity_session"
        indexes = [
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"session({self.user.email}, created={self.created_at:%Y-%m-%d %H:%M})"
```

- [ ] **Step 4: Implement the sessions service**

Create `apps/api/modules/identity/services/__init__.py` (empty).

Create `apps/api/modules/identity/services/sessions.py`:

```python
"""Sessions service — refresh-token tracking + revocation."""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime

from django.conf import settings
from django.utils import timezone

from modules.identity.models import Session, User


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(
    user: User,
    refresh_token: str,
    ip: str | None,
    user_agent: str,
) -> Session:
    lifetime = settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]
    return Session.objects.create(
        user=user,
        refresh_token_hash=_hash_token(refresh_token),
        ip=ip,
        user_agent=(user_agent or "")[:512],
        expires_at=timezone.now() + lifetime,
    )


def revoke_session(session_id: uuid.UUID) -> None:
    Session.objects.filter(id=session_id, revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )


def revoke_session_by_token(refresh_token: str) -> None:
    Session.objects.filter(
        refresh_token_hash=_hash_token(refresh_token),
        revoked_at__isnull=True,
    ).update(revoked_at=timezone.now())


def revoke_all_user_sessions(user: User) -> int:
    return Session.objects.filter(user=user, revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )


def is_session_revoked(refresh_token: str) -> bool:
    sess = Session.objects.filter(refresh_token_hash=_hash_token(refresh_token)).first()
    return sess is None or sess.revoked_at is not None
```

- [ ] **Step 5: Generate migration + run tests**

```
cd apps/api && uv run python manage.py makemigrations identity 2>&1 | tail -5 && uv run pytest modules/identity/tests/test_sessions.py -v 2>&1 | tail -10; cd ../..
```
Expected: `0003_session.py` created; 4 tests pass.

- [ ] **Step 6: Commit Task 1**

```
git add apps/api/modules/identity/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(identity): Session model + sessions service for refresh-token tracking"
```

---

## Task 2: Auth endpoints (login, refresh, logout, password reset, /me)

**Files:**
- Create: `apps/api/modules/identity/serializers.py`
- Create: `apps/api/modules/identity/services/auth.py`
- Create: `apps/api/modules/identity/views.py`
- Create: `apps/api/modules/identity/urls.py`
- Create: `apps/api/modules/identity/tests/test_auth_endpoints.py`
- Modify: `apps/api/hrms_api/urls.py`

- [ ] **Step 1: Write failing tests for the auth endpoints**

Create `apps/api/modules/identity/tests/test_auth_endpoints.py`:

```python
"""Integration tests for the auth endpoints (login, refresh, logout, /me, password reset)."""
import uuid

import pytest
from django.core import mail
from rest_framework.test import APIClient

from modules.identity.models import Session, User


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def user(org_id: uuid.UUID) -> User:
    return User.objects.create_user(
        email="alice@example.com",
        password="s3cret-p@ss",  # pragma: allowlist secret
        org_id=org_id,
    )


@pytest.mark.django_db
def test_login_returns_tokens(client: APIClient, user: User) -> None:
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "s3cret-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["mfa_required"] is False


@pytest.mark.django_db
def test_login_creates_session(client: APIClient, user: User) -> None:
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "s3cret-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 200
    assert Session.objects.filter(user=user, revoked_at__isnull=True).count() == 1


@pytest.mark.django_db
def test_login_rejects_bad_password(client: APIClient, user: User) -> None:
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "wrong"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 401


@pytest.mark.django_db
def test_login_increments_failed_count(client: APIClient, user: User) -> None:
    client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "wrong"},  # pragma: allowlist secret
        format="json",
    )
    user.refresh_from_db()
    assert user.failed_login_count == 1


@pytest.mark.django_db
def test_login_unknown_email_returns_401(client: APIClient) -> None:
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "nobody@example.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 401


@pytest.mark.django_db
def test_login_disabled_user_rejected(client: APIClient, user: User) -> None:
    user.status = "disabled"
    user.save()
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "s3cret-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 401


@pytest.mark.django_db
def test_me_requires_auth(client: APIClient) -> None:
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_me_returns_user_info(client: APIClient, user: User) -> None:
    resp = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "s3cret-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    access = resp.json()["access_token"]
    me = client.get("/api/v1/auth/me", HTTP_AUTHORIZATION=f"Bearer {access}")
    assert me.status_code == 200
    body = me.json()
    assert body["email"] == "alice@example.com"
    assert "id" in body and "org_id" in body
    assert "permissions" in body
    assert body["mfa_enabled"] is False


@pytest.mark.django_db
def test_refresh_rotates_token(client: APIClient, user: User) -> None:
    login = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "s3cret-p@ss"},  # pragma: allowlist secret
        format="json",
    ).json()
    refresh = login["refresh_token"]
    resp = client.post("/api/v1/auth/refresh", {"refresh_token": refresh}, format="json")
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body and "refresh_token" in body
    assert body["refresh_token"] != refresh   # rotation


@pytest.mark.django_db
def test_logout_revokes_session(client: APIClient, user: User) -> None:
    login = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "s3cret-p@ss"},  # pragma: allowlist secret
        format="json",
    ).json()
    access = login["access_token"]
    refresh = login["refresh_token"]

    resp = client.post(
        "/api/v1/auth/logout",
        {"refresh_token": refresh},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {access}",
    )
    assert resp.status_code in (200, 204)
    assert Session.objects.filter(user=user, revoked_at__isnull=True).count() == 0


@pytest.mark.django_db
def test_password_forgot_sends_email(client: APIClient, user: User) -> None:
    resp = client.post("/api/v1/auth/password/forgot", {"email": "alice@example.com"}, format="json")
    assert resp.status_code == 200
    assert len(mail.outbox) == 1
    assert "alice@example.com" in mail.outbox[0].to


@pytest.mark.django_db
def test_password_forgot_unknown_email_still_returns_200(client: APIClient) -> None:
    """Don't leak whether an email is registered."""
    resp = client.post("/api/v1/auth/password/forgot", {"email": "ghost@example.com"}, format="json")
    assert resp.status_code == 200
    assert len(mail.outbox) == 0


@pytest.mark.django_db
def test_password_reset_sets_new_password(client: APIClient, user: User) -> None:
    """End-to-end reset: forgot -> capture token from email -> reset -> can log in with new password."""
    client.post("/api/v1/auth/password/forgot", {"email": "alice@example.com"}, format="json")
    body = mail.outbox[0].body
    # The email body contains the token. Format expectation: "token: <token>"
    import re
    m = re.search(r"token:\s*(\S+)", body)
    assert m is not None
    token = m.group(1)

    resp = client.post(
        "/api/v1/auth/password/reset",
        {"token": token, "new_password": "newp@ss-w0rd"},  # pragma: allowlist secret
        format="json",
    )
    assert resp.status_code == 200

    # Old password no longer works
    bad = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "s3cret-p@ss"},  # pragma: allowlist secret
        format="json",
    )
    assert bad.status_code == 401

    # New password works
    good = client.post(
        "/api/v1/auth/login",
        {"email": "alice@example.com", "password": "newp@ss-w0rd"},  # pragma: allowlist secret
        format="json",
    )
    assert good.status_code == 200
```

- [ ] **Step 2: Run failing tests**

```
cd apps/api && uv run pytest modules/identity/tests/test_auth_endpoints.py -v 2>&1 | tail -10; cd ../..
```
Expected: 404s on the auth endpoints (urls don't exist yet).

- [ ] **Step 3: Implement `apps/api/modules/identity/serializers.py`**

```python
"""Serializers for the identity module."""
from __future__ import annotations

from rest_framework import serializers

from .models import User


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class LoginResponseSerializer(serializers.Serializer):
    access_token = serializers.CharField()
    refresh_token = serializers.CharField()
    mfa_required = serializers.BooleanField(default=False)
    mfa_token = serializers.CharField(required=False)


class RefreshSerializer(serializers.Serializer):
    refresh_token = serializers.CharField()


class LogoutSerializer(serializers.Serializer):
    refresh_token = serializers.CharField()


class MeSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "org_id", "email", "status", "mfa_enabled", "preferences", "permissions")

    def get_permissions(self, obj: User) -> list[str]:
        # M1b-3 will replace this with the cached permission set.
        return list(
            obj.user_roles.values_list("role__permissions__code", flat=True).distinct()
        )


class PasswordForgotSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)
```

- [ ] **Step 4: Implement `apps/api/modules/identity/services/auth.py`**

```python
"""Authentication services — login, refresh, password reset."""
from __future__ import annotations

import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
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
        return {"access_token": "", "refresh_token": "", "mfa_required": True, "mfa_token": mfa_token}

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
        message=f"Use this token to reset your password.\n\ntoken: {token}\n\nIf you did not request this, ignore this email.",
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
```

- [ ] **Step 5: Implement `apps/api/modules/identity/views.py`**

```python
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
    login as login_service,
    logout as logout_service,
    refresh_tokens,
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
```

- [ ] **Step 6: Implement `apps/api/modules/identity/urls.py`**

```python
from django.urls import path

from .views import (
    login_view,
    logout_view,
    me_view,
    password_forgot_view,
    password_reset_view,
    refresh_view,
)


urlpatterns = [
    path("auth/login", login_view, name="auth-login"),
    path("auth/refresh", refresh_view, name="auth-refresh"),
    path("auth/logout", logout_view, name="auth-logout"),
    path("auth/me", me_view, name="auth-me"),
    path("auth/password/forgot", password_forgot_view, name="auth-password-forgot"),
    path("auth/password/reset", password_reset_view, name="auth-password-reset"),
]
```

- [ ] **Step 7: Mount identity URLs in `apps/api/hrms_api/urls.py`**

Add to `api_v1_patterns`:
```python
    path("", include("modules.identity.urls")),
```

- [ ] **Step 8: Configure email backend for tests**

Edit `apps/api/hrms_api/settings/test.py` — add:
```python
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
DEFAULT_FROM_EMAIL = "test@hrms.local"
```

Edit `apps/api/hrms_api/settings/base.py` — confirm `DEFAULT_FROM_EMAIL` is set, and add `EMAIL_BACKEND` for dev pointing at MailHog:
```python
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = env("SMTP_HOST", default="mailhog")
EMAIL_PORT = env.int("SMTP_PORT", default=1025)
EMAIL_HOST_USER = env("SMTP_USER", default="")
EMAIL_HOST_PASSWORD = env("SMTP_PASSWORD", default="")
EMAIL_USE_TLS = env("SMTP_USE_TLS", default=False)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="hrms@provintell.local")
```

- [ ] **Step 9: Run auth-endpoint tests**

```
cd apps/api && uv run pytest modules/identity/tests/test_auth_endpoints.py -v 2>&1 | tail -25; cd ../..
```
Expected: 12 tests pass. Common failure mode: `mfa_token` field missing from response when MFA is not required — the serializer marks it `required=False`; if it errors with "this field may not be blank" make `required=False, allow_blank=True`.

- [ ] **Step 10: Commit Task 2**

```
git add apps/api/modules/identity/ apps/api/hrms_api/urls.py apps/api/hrms_api/settings/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(identity): auth endpoints — login, refresh, logout, /me, password reset"
```

---

## Task 3: MFA (TOTP) — enable, confirm, delete, login MFA challenge

**Files:**
- Modify: `apps/api/modules/identity/models.py` (add `MFADevice`)
- Create: `apps/api/modules/identity/services/mfa.py`
- Modify: `apps/api/modules/identity/serializers.py` (MFA serializers)
- Modify: `apps/api/modules/identity/views.py` (MFA views + login MFA challenge endpoint)
- Modify: `apps/api/modules/identity/urls.py`
- Create: `apps/api/modules/identity/tests/test_mfa.py`

- [ ] **Step 1: Write failing tests for MFA**

Create `apps/api/modules/identity/tests/test_mfa.py`:

```python
"""Tests for MFA TOTP enrollment, verification, and login MFA challenge."""
import uuid

import pyotp
import pytest
from rest_framework.test import APIClient

from modules.identity.models import MFADevice, User


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def user(org_id: uuid.UUID) -> User:
    return User.objects.create_user(email="bob@example.com", password="x", org_id=org_id)  # pragma: allowlist secret


def _login(client: APIClient, email: str, password: str) -> dict:
    return client.post("/api/v1/auth/login", {"email": email, "password": password}, format="json").json()


@pytest.mark.django_db
def test_enable_mfa_returns_provisioning_uri(client: APIClient, user: User) -> None:
    tokens = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    resp = client.post(
        "/api/v1/auth/mfa/enable",
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["provisioning_uri"].startswith("otpauth://totp/")
    assert "secret" in body  # base32 secret for the user to copy if QR fails


@pytest.mark.django_db
def test_confirm_mfa_marks_device_confirmed_and_user_enabled(client: APIClient, user: User) -> None:
    tokens = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    enable = client.post(
        "/api/v1/auth/mfa/enable",
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    ).json()
    secret = enable["secret"]
    code = pyotp.TOTP(secret).now()

    resp = client.post(
        "/api/v1/auth/mfa/confirm",
        {"code": code},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    )
    assert resp.status_code == 200
    user.refresh_from_db()
    assert user.mfa_enabled is True
    assert MFADevice.objects.get(user=user).confirmed_at is not None


@pytest.mark.django_db
def test_confirm_mfa_rejects_bad_code(client: APIClient, user: User) -> None:
    tokens = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    client.post(
        "/api/v1/auth/mfa/enable",
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    )
    resp = client.post(
        "/api/v1/auth/mfa/confirm",
        {"code": "000000"},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_disable_mfa_clears_device(client: APIClient, user: User) -> None:
    tokens = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    enable = client.post(
        "/api/v1/auth/mfa/enable",
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    ).json()
    secret = enable["secret"]
    client.post(
        "/api/v1/auth/mfa/confirm",
        {"code": pyotp.TOTP(secret).now()},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    )

    resp = client.delete(
        "/api/v1/auth/mfa",
        HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}",
    )
    assert resp.status_code in (200, 204)
    user.refresh_from_db()
    assert user.mfa_enabled is False
    assert MFADevice.objects.filter(user=user).count() == 0


@pytest.mark.django_db
def test_login_returns_mfa_required_when_enabled(client: APIClient, user: User) -> None:
    user.mfa_enabled = True
    user.save()
    body = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    assert body["mfa_required"] is True
    assert body["access_token"] == ""
    assert body["refresh_token"] == ""
    assert "mfa_token" in body and len(body["mfa_token"]) > 16


@pytest.mark.django_db
def test_login_mfa_step_completes_with_valid_totp(client: APIClient, user: User) -> None:
    """Full flow: login -> mfa_token -> POST mfa with code -> tokens issued."""
    # Set up an MFA device via the enable+confirm flow
    setup_tokens = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    enable = client.post(
        "/api/v1/auth/mfa/enable",
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {setup_tokens['access_token']}",
    ).json()
    secret = enable["secret"]
    client.post(
        "/api/v1/auth/mfa/confirm",
        {"code": pyotp.TOTP(secret).now()},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {setup_tokens['access_token']}",
    )

    # Now log in fresh — should get mfa_token
    login_body = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    assert login_body["mfa_required"] is True
    mfa_token = login_body["mfa_token"]

    # Complete the MFA step
    resp = client.post(
        "/api/v1/auth/login/mfa",
        {"mfa_token": mfa_token, "code": pyotp.TOTP(secret).now()},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert "access_token" in body and "refresh_token" in body


@pytest.mark.django_db
def test_login_mfa_step_rejects_bad_code(client: APIClient, user: User) -> None:
    user.mfa_enabled = True
    user.save()
    secret = pyotp.random_base32()
    MFADevice.objects.create(user=user, secret=secret, confirmed_at=user.created_at)

    body = _login(client, "bob@example.com", "x")  # pragma: allowlist secret
    resp = client.post(
        "/api/v1/auth/login/mfa",
        {"mfa_token": body["mfa_token"], "code": "000000"},
        format="json",
    )
    assert resp.status_code == 401
```

- [ ] **Step 2: Run failing tests**

```
cd apps/api && uv run pytest modules/identity/tests/test_mfa.py -v 2>&1 | tail -10; cd ../..
```
Expected: ImportError on `MFADevice` and 404s on the mfa endpoints.

- [ ] **Step 3: Add `MFADevice` to models.py**

Append to `apps/api/modules/identity/models.py`:

```python
from common.fields import EncryptedCharField


class MFADevice(models.Model):
    """A user's TOTP device. We currently support one device per user."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="mfa_device",
    )
    type = models.CharField(max_length=16, default="totp")
    secret = EncryptedCharField(max_length=64)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "identity_mfa_device"

    def __str__(self) -> str:
        return f"mfa({self.user.email}, type={self.type})"
```

- [ ] **Step 4: Implement `apps/api/modules/identity/services/mfa.py`**

```python
"""MFA (TOTP) services."""
from __future__ import annotations

import secrets

import pyotp
from django.core.cache import cache
from django.utils import timezone

from modules.identity.models import MFADevice, User


def enable(user: User) -> dict:
    """Generate a new TOTP secret + provisioning URI. Replaces any unconfirmed device."""
    MFADevice.objects.filter(user=user, confirmed_at__isnull=True).delete()
    secret = pyotp.random_base32()
    MFADevice.objects.update_or_create(
        user=user,
        defaults={"secret": secret, "type": "totp", "confirmed_at": None},
    )
    issuer = "HRMS"
    provisioning_uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=issuer)
    return {"secret": secret, "provisioning_uri": provisioning_uri}


def confirm(user: User, code: str) -> bool:
    """Verify the first TOTP code. On success, mark device confirmed and user.mfa_enabled = True."""
    device = MFADevice.objects.filter(user=user).first()
    if not device:
        return False
    totp = pyotp.TOTP(device.secret)
    if not totp.verify(code, valid_window=1):
        return False
    device.confirmed_at = timezone.now()
    device.last_used_at = timezone.now()
    device.save(update_fields=["confirmed_at", "last_used_at"])
    user.mfa_enabled = True
    user.save(update_fields=["mfa_enabled", "updated_at"])
    return True


def disable(user: User) -> None:
    MFADevice.objects.filter(user=user).delete()
    user.mfa_enabled = False
    user.save(update_fields=["mfa_enabled", "updated_at"])


def verify_login_mfa(mfa_token: str, code: str) -> User | None:
    """Complete the second step of MFA-required login."""
    user_id = cache.get(f"mfa_challenge:{mfa_token}")
    if not user_id:
        return None
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return None
    device = MFADevice.objects.filter(user=user, confirmed_at__isnull=False).first()
    if not device:
        return None
    if not pyotp.TOTP(device.secret).verify(code, valid_window=1):
        return None
    cache.delete(f"mfa_challenge:{mfa_token}")
    device.last_used_at = timezone.now()
    device.save(update_fields=["last_used_at"])
    return user
```

- [ ] **Step 5: Add MFA serializers and views**

Append to `apps/api/modules/identity/serializers.py`:

```python
class MFAConfirmSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=8)


class LoginMFASerializer(serializers.Serializer):
    mfa_token = serializers.CharField()
    code = serializers.CharField(max_length=8)
```

Append to `apps/api/modules/identity/views.py`:

```python
from .services import mfa as mfa_service
from .serializers import LoginMFASerializer, MFAConfirmSerializer
from .services.sessions import create_session


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
```

- [ ] **Step 6: Register MFA URLs**

Edit `apps/api/modules/identity/urls.py` — add:

```python
from .views import (
    login_mfa_view,
    mfa_confirm_view,
    mfa_disable_view,
    mfa_enable_view,
)


urlpatterns += [
    path("auth/mfa/enable", mfa_enable_view, name="mfa-enable"),
    path("auth/mfa/confirm", mfa_confirm_view, name="mfa-confirm"),
    path("auth/mfa", mfa_disable_view, name="mfa-disable"),
    path("auth/login/mfa", login_mfa_view, name="login-mfa"),
]
```

- [ ] **Step 7: Generate migration + run tests**

```
cd apps/api && uv run python manage.py makemigrations identity 2>&1 | tail -5 && uv run pytest modules/identity/tests/test_mfa.py -v 2>&1 | tail -15; cd ../..
```
Expected: `0004_*.py` adds `MFADevice`. 7 MFA tests pass.

- [ ] **Step 8: Final identity test run + manage.py check + contracts regen**

```
cd apps/api && \
  uv run pytest modules/identity/ -v 2>&1 | tail -10 && \
  uv run python manage.py check 2>&1 | tail -3 && \
  cd ../.. && \
  sg docker -c 'make contracts' 2>&1 | tail -5
git status packages/contracts/
```
Expected: ~31 tests pass (10 user + 8 roles + 6 seed + 4 sessions + 12 auth + 7 MFA = 47 actually; let's count later — the important thing is all green). Contracts regenerated with auth + MFA endpoints.

- [ ] **Step 9: Commit Task 3**

```
git add apps/api/modules/identity/ packages/contracts/openapi.yaml packages/contracts/generated.ts
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(identity): MFA (TOTP) — enable, confirm, disable, login MFA challenge"
```

---

## M1b-2 Acceptance Criteria

- [ ] `POST /api/v1/auth/login` returns `{access_token, refresh_token, mfa_required}` for active users
- [ ] `POST /api/v1/auth/refresh` rotates refresh tokens (returns new pair, revokes old session)
- [ ] `POST /api/v1/auth/logout` revokes the user's session
- [ ] `GET /api/v1/auth/me` returns the user's profile with permission codes
- [ ] `POST /api/v1/auth/password/forgot` emails a reset token (silent on unknown emails)
- [ ] `POST /api/v1/auth/password/reset` updates the password and revokes all sessions
- [ ] `POST /api/v1/auth/mfa/enable` returns provisioning URI + base32 secret
- [ ] `POST /api/v1/auth/mfa/confirm` enables MFA after verifying first TOTP code
- [ ] `DELETE /api/v1/auth/mfa` removes the device + clears `mfa_enabled`
- [ ] `POST /api/v1/auth/login` for an MFA-enabled user returns `{mfa_required: true, mfa_token}` with empty access/refresh
- [ ] `POST /api/v1/auth/login/mfa` completes the challenge with a valid TOTP code
- [ ] All identity tests green
- [ ] `manage.py check` clean (1 silenced)
- [ ] `make contracts` regenerated with auth + MFA endpoints
- [ ] `make lint` clean; pre-commit clean
- [ ] No `TODO`/`TBD`/`FIXME` in committed code

That is M1b-2. Next plan: **M1b-3 — RBAC mechanics + Permission cache** (HRMSPermission, TenantScopedManager wiring, OrgService, Redis perm-set caching).
