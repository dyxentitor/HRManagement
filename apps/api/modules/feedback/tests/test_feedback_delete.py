"""Tests for DELETE /api/v1/feedback/{id}/ — gated hard-delete."""

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from common.audit.models import AuditLog
from modules.feedback.models import Feedback, FeedbackAttachment
from modules.identity.models import Permission, Role, RolePermission, User
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
        name="Delete Test Org",
        slug="delete-test-org",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def admin_user(org):
    user = User.objects.create_user(
        email="admin@deletetest.com",
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
        email="emp@deletetest.com",
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
# Helper: submit a feedback, return id
# ---------------------------------------------------------------------------


def _fb(client):
    return client.post(
        "/api/v1/feedback/",
        {"category": "bug", "title": "T", "description": "D"},
        format="json",
    ).json()["id"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_admin_deletes_resolved(admin_client, emp_client, org):
    fid = _fb(emp_client)
    admin_client.patch(f"/api/v1/feedback/{fid}/", {"status": "resolved"}, format="json")
    # Attach a file so the S3-cleanup loop has something to delete — this makes the
    # mock assertion below load-bearing (a regression dropping the loop would fail it).
    FeedbackAttachment.objects.create(
        feedback_id=fid,
        filename="a.png",
        content_type="image/png",
        size_bytes=10,
        s3_key=f"feedback/{fid}/x_a.png",
        uploaded_by=org.id,
    )
    with patch("modules.feedback.services.attachment.FeedbackAttachmentService.delete") as m:
        r = admin_client.delete(f"/api/v1/feedback/{fid}/")
    assert r.status_code == 204
    assert m.call_count == 1  # the attachment's S3 object was cleaned up before hard-delete
    assert not Feedback.all_objects.filter(id=fid).exists()  # hard-deleted
    assert AuditLog.objects.filter(
        entity="feedback",
        entity_id=fid,
        action="feedback.deleted",
    ).exists()


def test_admin_deletes_closed(admin_client, emp_client, org):
    fid = _fb(emp_client)
    admin_client.patch(f"/api/v1/feedback/{fid}/", {"status": "closed"}, format="json")
    with patch("modules.feedback.services.attachment.FeedbackAttachmentService.delete"):
        r = admin_client.delete(f"/api/v1/feedback/{fid}/")
    assert r.status_code == 204
    assert not Feedback.all_objects.filter(id=fid).exists()


def test_cannot_delete_non_terminal(admin_client, emp_client):
    fid = _fb(emp_client)  # status "new"
    assert admin_client.delete(f"/api/v1/feedback/{fid}/").status_code == 400


def test_employee_cannot_delete(admin_client, emp_client):
    fid = _fb(emp_client)
    admin_client.patch(f"/api/v1/feedback/{fid}/", {"status": "resolved"}, format="json")
    assert emp_client.delete(f"/api/v1/feedback/{fid}/").status_code == 403
