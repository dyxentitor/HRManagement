"""Integration tests for /api/v1/feedback/ endpoints."""

import uuid

import pytest
from rest_framework.test import APIClient

from common.audit.models import AuditLog
from modules.feedback.models import Feedback
from modules.identity.models import Permission, Role, RolePermission, User
from modules.notification.models import Notification
from modules.organization.models import Organization

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def org():
    return Organization.objects.create(
        name="Feedback Org",
        slug="feedback-org",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def admin_user(org):
    user = User.objects.create_user(
        email="admin@feedback.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(org_id=org.id, code="org_admin", name="Org Admin", is_system=True)
    _grant(
        role,
        "feedback:submit:self",
        "feedback:read:self",
        "feedback:manage:org",
    )
    from modules.identity.models import UserRole

    UserRole.objects.create(user=user, role=role)
    return user


@pytest.fixture
def emp_user(org):
    user = User.objects.create_user(
        email="emp@feedback.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)
    _grant(
        role,
        "feedback:submit:self",
        "feedback:read:self",
    )
    from modules.identity.models import UserRole

    UserRole.objects.create(user=user, role=role)
    return user


@pytest.fixture
def admin_client(admin_user):
    c = APIClient()
    c.force_authenticate(user=admin_user)
    return c


@pytest.fixture
def emp_client(emp_user):
    c = APIClient()
    c.force_authenticate(user=emp_user)
    return c


# ---------------------------------------------------------------------------
# Helper to submit feedback
# ---------------------------------------------------------------------------


def _submit(client):
    return client.post(
        "/api/v1/feedback/",
        {"category": "bug", "title": "Broken", "description": "steps"},
        format="json",
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_submit_sets_reporter_and_new(emp_client, emp_user):
    r = _submit(emp_client)
    assert r.status_code == 201
    fb = Feedback.all_objects.get(id=r.json()["id"])
    assert fb.reporter_id == emp_user.id and fb.status == "new"


def test_list_self_only(emp_client, admin_client):
    _submit(emp_client)
    _submit(admin_client)
    r = emp_client.get("/api/v1/feedback/?scope=self")
    assert r.status_code == 200
    data = r.json()
    items = data.get("results", data) if isinstance(data, dict) else data
    assert len(items) == 1


def test_list_org_requires_manage(emp_client):
    assert emp_client.get("/api/v1/feedback/?scope=org").status_code == 403


def test_retrieve_others_forbidden_without_manage(emp_client, admin_client):
    fid = _submit(admin_client).json()["id"]
    assert emp_client.get(f"/api/v1/feedback/{fid}/").status_code == 403


def test_admin_patch_status_updates_status(admin_client, emp_client):
    fid = _submit(emp_client).json()["id"]
    r = admin_client.patch(
        f"/api/v1/feedback/{fid}/",
        {"status": "resolved"},
        format="json",
    )
    assert r.status_code == 200
    assert Feedback.all_objects.get(id=fid).status == "resolved"
    # feedback.status_changed notifications are no longer sent (rework in v1.x)
    assert not Notification.objects.filter(type="feedback.status_changed").exists()


def test_emp_cannot_patch(emp_client):
    fid = _submit(emp_client).json()["id"]
    assert (
        emp_client.patch(
            f"/api/v1/feedback/{fid}/",
            {"status": "resolved"},
            format="json",
        ).status_code
        == 403
    )


def test_status_change_writes_audit_row(admin_client, emp_client):
    fid = _submit(emp_client).json()["id"]
    r = admin_client.patch(
        f"/api/v1/feedback/{fid}/",
        {"status": "resolved"},
        format="json",
    )
    assert r.status_code == 200
    assert AuditLog.objects.filter(
        entity="feedback",
        entity_id=fid,
        action="feedback.status.changed",
    ).exists()


def test_patch_status_plus_bad_assignee_is_atomic(admin_client, emp_client):
    fid = _submit(emp_client).json()["id"]
    original_status = Feedback.all_objects.get(id=fid).status

    r = admin_client.patch(
        f"/api/v1/feedback/{fid}/",
        {"status": "resolved", "assignee_id": str(uuid.uuid4())},
        format="json",
    )
    assert r.status_code == 400

    # Status must be rolled back — the atomic block should have unwound the
    # earlier status write and its audit row.
    fb = Feedback.all_objects.get(id=fid)
    assert fb.status == original_status
    assert not AuditLog.objects.filter(
        entity="feedback",
        entity_id=fid,
        action="feedback.status.changed",
    ).exists()


def test_put_not_allowed(admin_client, emp_client):
    """PUT must be rejected with 405 (spec has no replace)."""
    fid = _submit(emp_client).json()["id"]
    assert (
        admin_client.put(
            f"/api/v1/feedback/{fid}/",
            {"status": "closed"},
            format="json",
        ).status_code
        == 405
    )
