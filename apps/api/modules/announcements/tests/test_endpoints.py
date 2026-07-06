
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from modules.announcements.models import Announcement
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


@pytest.fixture
def org():
    return Organization.objects.create(
        name="Provintell",
        slug="provintell",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def _client(org, perms, email="u@e.com"):
    user = User.objects.create_user(
        email=email, password="x", org_id=org.id  # pragma: allowlist secret
    )
    role = Role.objects.create(
        org_id=org.id, code=f"r_{email}", name="R", is_system=True
    )
    for code in perms:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    c = APIClient()
    tok = c.post(
        "/api/v1/auth/login",
        {"email": email, "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {tok['access_token']}")
    return c, user


def _published(org):
    return Announcement.objects.create(
        org_id=org.id,
        title="Hello",
        body="World",
        status="published",
        published_at=timezone.now(),
        audience_type="all",
    )


@pytest.mark.django_db
def test_feed_returns_published_with_is_read_false(org):
    _published(org)
    c, _ = _client(org, ["announcement:read"])
    resp = c.get("/api/v1/announcements/feed/")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["is_read"] is False


@pytest.mark.django_db
def test_mark_read_then_unread_count_zero(org):
    a = _published(org)
    c, _ = _client(org, ["announcement:read"])
    assert c.get("/api/v1/announcements/unread-count/").json() == {"count": 1}
    assert c.post(f"/api/v1/announcements/{a.id}/read/").status_code == 200
    assert c.get("/api/v1/announcements/unread-count/").json() == {"count": 0}


@pytest.mark.django_db
def test_publish_action_requires_write(org):
    a = Announcement.objects.create(org_id=org.id, title="T", body="B")
    c, _ = _client(org, ["announcement:read"])
    assert c.post(f"/api/v1/announcements/{a.id}/publish/").status_code == 403


@pytest.mark.django_db
def test_publish_action_flips_status(org):
    a = Announcement.objects.create(org_id=org.id, title="T", body="B", audience_type="all")
    c, _ = _client(org, ["announcement:read", "announcement:write"])
    resp = c.post(f"/api/v1/announcements/{a.id}/publish/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "published"
