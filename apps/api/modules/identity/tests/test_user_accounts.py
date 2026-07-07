"""Tests for the account list endpoint (GET /api/v1/users/)."""

import pytest
from rest_framework.test import APIClient

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


def _org(slug="acc"):
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
def test_list_accounts_org_scoped():
    org = _org()
    _user(org, "a@x.com")
    _user(org, "b@x.com", status="disabled")
    client = _client(org, "admin@x.com", ["user:read:org"])
    resp = client.get("/api/v1/users/")
    assert resp.status_code == 200
    emails = {r["email"] for r in resp.json()}
    assert "a@x.com" in emails and "admin@x.com" in emails
    assert "b@x.com" not in emails  # default = active only


@pytest.mark.django_db
def test_list_status_filter_disabled_and_archived():
    org = _org("acc2")
    _user(org, "dis@x.com", status="disabled")
    g = _user(org, "gone@x.com")
    g.soft_delete()
    client = _client(org, "admin@x.com", ["user:read:org"])
    assert {r["email"] for r in client.get("/api/v1/users/?status=disabled").json()} == {"dis@x.com"}
    assert {r["email"] for r in client.get("/api/v1/users/?status=archived").json()} == {"gone@x.com"}


@pytest.mark.django_db
def test_list_requires_read_org():
    org = _org("acc3")
    client = _client(org, "emp@x.com", ["user:read:self"])
    assert client.get("/api/v1/users/").status_code == 403
