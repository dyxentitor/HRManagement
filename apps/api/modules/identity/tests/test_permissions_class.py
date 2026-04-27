"""Tests for the HRMSPermission DRF class."""

import uuid

import pytest
from django.test import RequestFactory

from modules.identity.models import (
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)
from modules.identity.permissions import HRMSPermission


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def user_with_perm(org_id: uuid.UUID):
    user = User.objects.create_user(
        email="u@example.com",
        password="x",
        org_id=org_id,  # pragma: allowlist secret
    )
    role = Role.objects.create(org_id=org_id, code="manager", name="Manager", is_system=True)
    p = Permission.objects.create(code="leave:request:approve:team", description="")
    RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    return user


def _make_view(required: list[str]):
    class _View:
        required_perms = required

    return _View()


@pytest.mark.django_db
def test_user_with_required_perm_is_allowed(rf: RequestFactory, user_with_perm: User) -> None:
    perm = HRMSPermission()
    request = rf.get("/x")
    request.user = user_with_perm
    view = _make_view(["leave:request:approve:team"])
    assert perm.has_permission(request, view) is True


@pytest.mark.django_db
def test_user_missing_perm_is_denied(rf: RequestFactory, user_with_perm: User) -> None:
    perm = HRMSPermission()
    request = rf.get("/x")
    request.user = user_with_perm
    view = _make_view(["payroll:run:create"])
    assert perm.has_permission(request, view) is False


@pytest.mark.django_db
def test_anonymous_user_denied(rf: RequestFactory) -> None:
    from django.contrib.auth.models import AnonymousUser

    perm = HRMSPermission()
    request = rf.get("/x")
    request.user = AnonymousUser()
    view = _make_view(["user:read:self"])
    assert perm.has_permission(request, view) is False


@pytest.mark.django_db
def test_object_permission_org_scope(
    rf: RequestFactory, user_with_perm: User, org_id: uuid.UUID
) -> None:
    """has_object_permission rejects objects from a different org."""
    perm = HRMSPermission()
    request = rf.get("/x")
    request.user = user_with_perm
    view = _make_view(["leave:request:approve:team"])

    same_org = type("Obj", (), {"org_id": org_id})()
    other_org = type("Obj", (), {"org_id": uuid.uuid4()})()

    assert perm.has_object_permission(request, view, same_org) is True
    assert perm.has_object_permission(request, view, other_org) is False


@pytest.mark.django_db
def test_view_with_no_required_perms_allowed_when_authenticated(
    rf: RequestFactory, user_with_perm: User
) -> None:
    """If view doesn't declare required_perms, just check authentication."""
    perm = HRMSPermission()
    request = rf.get("/x")
    request.user = user_with_perm
    view = type("V", (), {})()  # no required_perms
    assert perm.has_permission(request, view) is True


@pytest.mark.django_db
def test_multiple_required_perms_all_must_match(rf: RequestFactory, user_with_perm: User) -> None:
    perm = HRMSPermission()
    request = rf.get("/x")
    request.user = user_with_perm
    view = _make_view(["leave:request:approve:team", "claim:approve:team"])
    assert perm.has_permission(request, view) is False  # only has the leave perm
