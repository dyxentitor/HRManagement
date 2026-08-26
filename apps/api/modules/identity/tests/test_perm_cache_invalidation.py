"""Every path that mutates a user's effective permissions must bust the cache.

`get_user_perms` caches for PERM_CACHE_TTL (300s). Invalidation is normally
automatic: identity/signals.py hooks post_save/post_delete on RolePermission
and UserRole. `bulk_create` bypasses signals, so a bulk grant silently leaves
every holder of that role on a stale permission set for up to five minutes.

Found in production: an admin granted two permissions to a role, the DB showed
67 perms, and the resolver kept returning 65. It reproduced only for a *pure*
grant — any change that also removed a permission fired post_delete and busted
the cache as a side effect, which is why it went unnoticed.
"""

from __future__ import annotations

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
    assign_roles_to_user,
    get_user_perms,
    reset_role_to_defaults,
    set_role_permissions,
)

pytestmark = pytest.mark.django_db

PERM_A = "leave:request:approve:team"
PERM_B = "schedule:swap:approve:team"


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    cache.clear()


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def perms() -> dict[str, Permission]:
    return {
        code: Permission.objects.create(code=code, description="")
        for code in (PERM_A, PERM_B, "user:read:team", "role:write", "identity:role:read")
    }


@pytest.fixture
def admin(org_id, perms) -> User:
    """An org_admin actor — the services require one to authorise the change."""
    user = User.objects.create_user(
        email="admin@example.com", password="x", org_id=org_id
    )  # pragma: allowlist secret
    role = Role.objects.create(org_id=org_id, code="org_admin", name="Org Admin", is_system=True)
    for p in Permission.objects.all():
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    return user


@pytest.fixture
def member(org_id, perms) -> tuple[User, Role]:
    user = User.objects.create_user(
        email="member@example.com", password="x", org_id=org_id
    )  # pragma: allowlist secret
    role = Role.objects.create(org_id=org_id, code="team_lead", name="Team Lead", is_system=True)
    RolePermission.objects.create(role=role, permission=perms[PERM_A])
    UserRole.objects.create(user=user, role=role, granted_by=None)
    return user, role


def test_granting_a_permission_to_a_role_takes_effect_immediately(admin, member) -> None:
    """The production bug: DB said 67 perms, the resolver kept saying 65."""
    user, _ = member
    assert get_user_perms(user) == frozenset({PERM_A})  # populates the cache

    set_role_permissions(actor=admin, role_code="team_lead", permission_codes=[PERM_A, PERM_B])

    assert PERM_B in get_user_perms(user), "new permission must be visible without waiting for TTL"


def test_revoking_a_permission_from_a_role_takes_effect_immediately(admin, member) -> None:
    """The security-relevant direction — a revoked perm must not linger."""
    user, role = member
    RolePermission.objects.create(role=role, permission=Permission.objects.get(code=PERM_B))
    assert PERM_B in get_user_perms(user)  # populates the cache

    set_role_permissions(actor=admin, role_code="team_lead", permission_codes=[PERM_A])

    assert PERM_B not in get_user_perms(user), "revoked permission must not survive in cache"


def test_reset_role_to_defaults_takes_effect_immediately(admin, member, perms) -> None:
    user, role = member
    RolePermission.objects.create(role=role, permission=perms[PERM_B])
    assert PERM_B in get_user_perms(user)  # populates the cache

    reset_role_to_defaults(actor=admin, role_code="team_lead")

    after = get_user_perms(user)
    from_db = frozenset(
        RolePermission.objects.filter(role=role).values_list("permission__code", flat=True)
    )
    assert after == from_db, "cached set must match the DB after a reset"


def test_assigning_a_role_to_a_user_takes_effect_immediately(admin, member, org_id, perms) -> None:
    user, _ = member
    assert get_user_perms(user) == frozenset({PERM_A})  # populates the cache

    extra = Role.objects.create(org_id=org_id, code="finance", name="Finance", is_system=True)
    RolePermission.objects.create(role=extra, permission=perms[PERM_B])

    assign_roles_to_user(actor=admin, target=user, role_codes=["team_lead", "finance"])

    assert PERM_B in get_user_perms(user), "newly assigned role must apply without waiting for TTL"


def test_removing_a_role_from_a_user_takes_effect_immediately(admin, member, org_id, perms) -> None:
    user, _ = member
    extra = Role.objects.create(org_id=org_id, code="finance", name="Finance", is_system=True)
    RolePermission.objects.create(role=extra, permission=perms[PERM_B])
    assign_roles_to_user(actor=admin, target=user, role_codes=["team_lead", "finance"])
    assert PERM_B in get_user_perms(user)  # populates the cache

    assign_roles_to_user(actor=admin, target=user, role_codes=["team_lead"])

    assert PERM_B not in get_user_perms(user), "revoked role must not survive in cache"


def test_resetting_a_role_that_had_no_permissions_takes_effect_immediately(
    admin, org_id, perms
) -> None:
    """The edge case that makes reset_role_to_defaults only *accidentally* safe.

    Reset deletes then bulk-creates. The delete fires post_delete and busts the
    cache — but only if there was something to delete. With an empty role the
    delete is a no-op, so nothing invalidates and the bulk_create's additions
    stay invisible.
    """
    user = User.objects.create_user(
        email="empty@example.com", password="x", org_id=org_id
    )  # pragma: allowlist secret
    # `team_lead` deliberately: its defaults include PERM_A and PERM_B, which the
    # `perms` fixture creates. Reset can only grant codes that exist in the
    # catalogue, so a role whose defaults are all absent would reset to nothing
    # and make this test vacuous again.
    role = Role.objects.create(org_id=org_id, code="team_lead", name="Team Lead", is_system=True)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    assert get_user_perms(user) == frozenset()  # populates the cache with the empty set

    reset_role_to_defaults(actor=admin, role_code="team_lead")

    from_db = frozenset(
        RolePermission.objects.filter(role=role).values_list("permission__code", flat=True)
    )
    # Without this the test is vacuous: if the reset granted nothing, both sides
    # are the empty set and a stale cache would sail through.
    assert from_db, "reset must actually grant the role's defaults for this test to bite"
    assert get_user_perms(user) == from_db


def test_no_bulk_create_of_permissions_without_explicit_invalidation() -> None:
    """Guards the hazard class, not the individual bug.

    Cache invalidation is wired through post_save/post_delete receivers on
    RolePermission and UserRole (see identity/signals.py). `bulk_create`
    bypasses signals entirely, so any code path that grants permissions in bulk
    MUST invalidate by hand. That is the single mistake behind the production
    incident, and a behavioural test only ever covers the paths someone
    remembered to write one for.
    """
    import inspect

    from modules.identity.services import permissions as mod

    offenders = []
    for name, fn in inspect.getmembers(mod, inspect.isfunction):
        if fn.__module__ != mod.__name__ or name.startswith("_"):
            continue
        src = inspect.getsource(fn)
        if "bulk_create" in src and "invalidate_" not in src:
            offenders.append(name)

    # clone_role bulk-creates into a role that was just created and therefore
    # has no members, so no cached set can be stale. It is the one safe case.
    assert offenders == ["clone_role"], (
        f"bulk_create bypasses the invalidation signals; these paths grant "
        f"permissions without busting the cache: {offenders}"
    )
