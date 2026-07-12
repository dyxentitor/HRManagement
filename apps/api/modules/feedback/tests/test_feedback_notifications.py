"""Tests for feedback notification rework.

- New feedback notifies org_admins (feedback.received, in_app only).
- Reporter is excluded from the notification.
- Status change no longer creates feedback.status_changed notification.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
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
        name="Notif Test Org",
        slug="notif-test-org",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def admin_user(org):
    """An org_admin who should RECEIVE feedback.received notifications."""
    user = User.objects.create_user(
        email="admin@notiftest.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(
        org_id=org.id,
        code="org_admin",
        name="Org Admin",
        is_system=True,
    )
    _grant(
        role,
        "feedback:submit:self",
        "feedback:read:self",
        "feedback:manage:org",
    )
    UserRole.objects.create(user=user, role=role)
    return user


@pytest.fixture
def emp_user(org):
    """An employee who submits feedback — must NOT receive admin notification."""
    user = User.objects.create_user(
        email="emp@notiftest.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(
        org_id=org.id,
        code="employee",
        name="Employee",
        is_system=True,
    )
    _grant(
        role,
        "feedback:submit:self",
        "feedback:read:self",
    )
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
# Tests
# ---------------------------------------------------------------------------


def test_new_feedback_notifies_admins_not_reporter(emp_client, emp_user, admin_user, org):
    """Submitting feedback sends feedback.received in_app to org_admins; reporter excluded."""
    emp_client.post(
        "/api/v1/feedback/",
        {"category": "bug", "title": "T", "description": "D"},
        format="json",
    )
    recv = Notification.objects.filter(type="feedback.received")
    assert recv.filter(user=admin_user, channel="in_app").exists()
    assert not recv.filter(user=emp_user).exists()  # reporter excluded
    assert not recv.filter(channel="email").exists()  # in-app only


def test_status_change_no_longer_notifies(admin_client, emp_client):
    """Patching status must NOT create feedback.status_changed notification rows."""
    fid = emp_client.post(
        "/api/v1/feedback/",
        {"category": "bug", "title": "T", "description": "D"},
        format="json",
    ).json()["id"]
    admin_client.patch(f"/api/v1/feedback/{fid}/", {"status": "resolved"}, format="json")
    assert not Notification.objects.filter(type="feedback.status_changed").exists()
