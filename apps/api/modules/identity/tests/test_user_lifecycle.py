"""Tests for account lifecycle endpoints (disable/enable/delete/restore)."""

import pytest
from rest_framework.test import APIClient

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


def _org(slug="lc"):
    return Organization.objects.create(
        name="X",
        slug=slug,
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def _user(org, email, perms=(), status="active"):
    u = User.objects.create_user(email=email, password="x", org_id=org.id)  # pragma: allowlist secret
    u.status = status
    u.save()
    if perms:
        role = Role.objects.create(org_id=org.id, code=f"r_{email}", name="R", is_system=False)
        for c in perms:
            p, _ = Permission.objects.get_or_create(code=c, defaults={"description": ""})
            RolePermission.objects.create(role=role, permission=p)
        UserRole.objects.create(user=u, role=role, granted_by=None)
    return u


def _client(org, email, perms):
    _user(org, email, perms)
    c = APIClient()
    body = c.post(
        "/api/v1/auth/login", {"email": email, "password": "x"}, format="json"
    ).json()  # pragma: allowlist secret
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access_token']}")
    return c


@pytest.mark.django_db
def test_disable_then_enable():
    org = _org()
    target = _user(org, "t@x.com")
    client = _client(org, "admin@x.com", ["user:disable"])
    assert client.post(f"/api/v1/users/{target.id}/disable/").status_code == 200
    target.refresh_from_db()
    assert target.status == "disabled" and target.is_active is False
    assert client.post(f"/api/v1/users/{target.id}/enable/").status_code == 200
    target.refresh_from_db()
    assert target.status == "active" and target.is_active is True


@pytest.mark.django_db
def test_delete_then_restore():
    org = _org("lc2")
    target = _user(org, "t@x.com")
    client = _client(org, "admin@x.com", ["user:delete"])
    assert client.delete(f"/api/v1/users/{target.id}/").status_code in (200, 204)
    target.refresh_from_db()
    assert target.deleted_at is not None and target.is_active is False
    assert client.post(f"/api/v1/users/{target.id}/restore/").status_code == 200
    target.refresh_from_db()
    assert target.deleted_at is None and target.is_active is True


@pytest.mark.django_db
def test_detail_endpoint():
    org = _org("lc5")
    target = _user(org, "t@x.com")
    client = _client(org, "admin@x.com", ["user:read:org"])
    resp = client.get(f"/api/v1/users/{target.id}/")
    assert resp.status_code == 200
    assert resp.json()["email"] == "t@x.com"


@pytest.mark.django_db
def test_cannot_disable_self():
    org = _org("lc3")
    client = _client(org, "admin@x.com", ["user:disable"])
    me = User.objects.get(email="admin@x.com")
    assert client.post(f"/api/v1/users/{me.id}/disable/").status_code == 400


@pytest.mark.django_db
def test_disable_requires_perm():
    org = _org("lc4")
    target = _user(org, "t@x.com")
    client = _client(org, "weak@x.com", ["user:read:org"])
    assert client.post(f"/api/v1/users/{target.id}/disable/").status_code == 403
