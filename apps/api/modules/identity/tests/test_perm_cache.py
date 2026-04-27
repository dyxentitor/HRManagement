"""Tests for the permission-set service + Redis-backed cache + invalidation."""

import uuid

import pytest
from django.core.cache import cache

from modules.identity.models import (
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)
from modules.identity.services.permissions import (
    PERM_CACHE_TTL,
    get_user_perms,
    invalidate_user_perms,
)


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    cache.clear()


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def user_with_role(org_id: uuid.UUID) -> tuple[User, Role]:
    user = User.objects.create_user(
        email="u@example.com", password="x", org_id=org_id
    )  # pragma: allowlist secret
    role = Role.objects.create(org_id=org_id, code="manager", name="Manager", is_system=True)
    p1 = Permission.objects.create(code="user:read:team", description="")
    p2 = Permission.objects.create(code="leave:request:approve:team", description="")
    RolePermission.objects.create(role=role, permission=p1)
    RolePermission.objects.create(role=role, permission=p2)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    return user, role


@pytest.mark.django_db
def test_get_user_perms_returns_assigned_codes(user_with_role) -> None:
    user, _ = user_with_role
    perms = get_user_perms(user)
    assert perms == frozenset({"user:read:team", "leave:request:approve:team"})


@pytest.mark.django_db
def test_get_user_perms_caches_result(user_with_role) -> None:
    user, _ = user_with_role
    get_user_perms(user)  # populate cache
    cached = cache.get(f"user_perms:{user.id}")
    assert cached is not None


@pytest.mark.django_db
def test_get_user_perms_uses_cache_on_second_call(user_with_role) -> None:
    from django.db.models.signals import post_delete, post_save

    from modules.identity.signals import _on_user_role_change

    user, _ = user_with_role
    first = get_user_perms(user)
    # Disconnect signals so the delete doesn't bust the cache — we want to
    # verify the cache layer independently of the signal invalidation path.
    post_save.disconnect(_on_user_role_change, sender=UserRole)
    post_delete.disconnect(_on_user_role_change, sender=UserRole)
    try:
        UserRole.objects.filter(user=user).delete()
        second = get_user_perms(user)
    finally:
        post_save.connect(_on_user_role_change, sender=UserRole)
        post_delete.connect(_on_user_role_change, sender=UserRole)
    assert first == second


@pytest.mark.django_db
def test_invalidate_user_perms_clears_cache(user_with_role) -> None:
    user, _ = user_with_role
    get_user_perms(user)
    invalidate_user_perms(user.id)
    assert cache.get(f"user_perms:{user.id}") is None


@pytest.mark.django_db
def test_user_role_change_invalidates_cache(user_with_role, org_id: uuid.UUID) -> None:
    """Adding/removing a UserRole should auto-invalidate via signal."""
    user, _ = user_with_role
    get_user_perms(user)
    assert cache.get(f"user_perms:{user.id}") is not None

    new_role = Role.objects.create(org_id=org_id, code="finance", name="Finance", is_system=True)
    UserRole.objects.create(user=user, role=new_role, granted_by=None)

    assert cache.get(f"user_perms:{user.id}") is None


@pytest.mark.django_db
def test_role_permission_change_invalidates_all_users_with_role(user_with_role) -> None:
    user, role = user_with_role
    get_user_perms(user)
    assert cache.get(f"user_perms:{user.id}") is not None

    new_perm = Permission.objects.create(code="claim:approve:team", description="")
    RolePermission.objects.create(role=role, permission=new_perm)

    assert cache.get(f"user_perms:{user.id}") is None


def test_perm_cache_ttl_matches_spec() -> None:
    # Spec §5: 5 minutes (300s)
    assert PERM_CACHE_TTL == 300
