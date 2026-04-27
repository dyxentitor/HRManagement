"""Tests for Permission catalogue, Role bundles, RolePermission, UserRole."""

import uuid

import pytest
from django.db import IntegrityError

from modules.identity.models import (
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def user(org_id: uuid.UUID) -> User:
    return User.objects.create_user(email="u@example.com", password="x", org_id=org_id)


@pytest.mark.django_db
def test_permission_code_unique() -> None:
    Permission.objects.create(code="auth:mfa:manage:self", description="Manage own MFA")
    with pytest.raises(IntegrityError):
        Permission.objects.create(code="auth:mfa:manage:self", description="Duplicate")


@pytest.mark.django_db
def test_role_unique_per_org(org_id: uuid.UUID) -> None:
    Role.objects.create(org_id=org_id, code="org_admin", name="Org Admin", is_system=True)
    with pytest.raises(IntegrityError):
        Role.objects.create(org_id=org_id, code="org_admin", name="Dup", is_system=False)


@pytest.mark.django_db
def test_role_same_code_allowed_across_orgs() -> None:
    org_a, org_b = uuid.uuid4(), uuid.uuid4()
    Role.objects.create(org_id=org_a, code="manager", name="Manager", is_system=True)
    Role.objects.create(org_id=org_b, code="manager", name="Manager", is_system=True)
    assert Role.objects.filter(code="manager").count() == 2


@pytest.mark.django_db
def test_role_permissions_link(org_id: uuid.UUID) -> None:
    role = Role.objects.create(org_id=org_id, code="hr_manager", name="HR Manager", is_system=True)
    p1 = Permission.objects.create(code="user:invite", description="Invite users")
    p2 = Permission.objects.create(code="user:edit", description="Edit users")
    RolePermission.objects.create(role=role, permission=p1)
    RolePermission.objects.create(role=role, permission=p2)
    codes = set(role.permissions.values_list("code", flat=True))
    assert codes == {"user:invite", "user:edit"}


@pytest.mark.django_db
def test_role_permission_link_unique(org_id: uuid.UUID) -> None:
    role = Role.objects.create(org_id=org_id, code="r", name="r", is_system=True)
    p = Permission.objects.create(code="x:y", description="x")
    RolePermission.objects.create(role=role, permission=p)
    with pytest.raises(IntegrityError):
        RolePermission.objects.create(role=role, permission=p)


@pytest.mark.django_db
def test_user_role_assignment(user: User, org_id: uuid.UUID) -> None:
    role = Role.objects.create(org_id=org_id, code="employee", name="Employee", is_system=True)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    assert user.roles.count() == 1
    assert user.roles.first() == role


@pytest.mark.django_db
def test_user_can_hold_multiple_roles(user: User, org_id: uuid.UUID) -> None:
    role_mgr = Role.objects.create(org_id=org_id, code="manager", name="Manager", is_system=True)
    role_fin = Role.objects.create(org_id=org_id, code="finance", name="Finance", is_system=True)
    UserRole.objects.create(user=user, role=role_mgr, granted_by=None)
    UserRole.objects.create(user=user, role=role_fin, granted_by=None)
    codes = set(user.roles.values_list("code", flat=True))
    assert codes == {"manager", "finance"}


@pytest.mark.django_db
def test_user_role_granted_by_self_reference(user: User, org_id: uuid.UUID) -> None:
    granter = User.objects.create_user(email="boss@example.com", password="x", org_id=org_id)
    role = Role.objects.create(org_id=org_id, code="employee", name="Employee", is_system=True)
    ur = UserRole.objects.create(user=user, role=role, granted_by=granter)
    assert ur.granted_by == granter
