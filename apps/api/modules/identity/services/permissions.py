"""Permission-set service with Redis caching."""

from __future__ import annotations

import uuid

from django.core.cache import cache

from modules.identity.models import User

PERM_CACHE_TTL = 300  # seconds — spec §5
_KEY = "user_perms:{user_id}"


def _cache_key(user_id: uuid.UUID | str) -> str:
    return _KEY.format(user_id=user_id)


def get_user_perms(user: User) -> frozenset[str]:
    """Return the user's effective permission code set. Cached for PERM_CACHE_TTL."""
    key = _cache_key(user.id)
    cached = cache.get(key)
    if cached is not None:
        return frozenset(cached)

    codes = (
        user.user_roles.values_list("role__permissions__code", flat=True)
        .exclude(role__permissions__code__isnull=True)
        .distinct()
    )
    perms = frozenset(codes)
    cache.set(key, list(perms), timeout=PERM_CACHE_TTL)
    return perms


def invalidate_user_perms(user_id: uuid.UUID | str) -> None:
    cache.delete(_cache_key(user_id))


def invalidate_role_users(role_id: uuid.UUID | str) -> None:
    """Invalidate all users that hold the given role."""
    from modules.identity.models import UserRole

    for uid in (
        UserRole.objects.filter(role_id=role_id).values_list("user_id", flat=True).distinct()
    ):
        invalidate_user_perms(uid)


# --- Admin: role assignment ---------------------------------------------


class UnknownRoleError(Exception):
    """Raised when a role_code in the assign request doesn't exist in the org."""


class SelfDemoteError(Exception):
    """Raised when actor tries to remove their own org_admin role."""


class LastAdminError(Exception):
    """Raised when removing org_admin would leave the org with zero admins."""


def assign_roles_to_user(*, actor, target, role_codes: list[str]):
    """Replace the target user's role set in the actor's org.

    - Validates every code exists in the target's org.
    - Refuses if actor == target AND new set drops org_admin.
    - Refuses if removing org_admin from anyone would leave zero admins.
    - Writes audit rows: user.role_granted (per added) + user.role_revoked (per removed).
    - Idempotent: same set in → zero audit rows, zero DB writes.

    Raises UnknownRoleError, SelfDemoteError, LastAdminError.
    """
    from common.audit import service as audit  # singular `service`!
    from modules.identity.models import Role, UserRole

    role_codes = list(dict.fromkeys(role_codes))  # dedupe, preserve order

    # Resolve all role codes in the target's org
    role_qs = Role.objects.filter(org_id=target.org_id, code__in=role_codes)
    found_by_code = {r.code: r for r in role_qs}
    missing = [c for c in role_codes if c not in found_by_code]
    if missing:
        raise UnknownRoleError(f"Unknown role code(s): {', '.join(missing)}")

    current_codes = set(
        UserRole.objects.filter(user=target).values_list("role__code", flat=True),
    )
    requested_codes = set(role_codes)
    to_add = requested_codes - current_codes
    to_remove = current_codes - requested_codes

    # Lockout guard 1: self-demote
    if (
        actor.id == target.id
        and "org_admin" in current_codes
        and "org_admin" not in requested_codes
    ):
        raise SelfDemoteError(
            "You can't remove your own org_admin role. Ask another admin first.",
        )

    # Lockout guard 2: last admin in org
    if "org_admin" in to_remove:
        remaining_admins = (
            UserRole.objects.filter(role__org_id=target.org_id, role__code="org_admin")
            .exclude(user=target)
            .count()
        )
        if remaining_admins == 0:
            raise LastAdminError(
                "At least one user in this organisation must be an org_admin. "
                "Grant the role to someone else first.",
            )

    if not to_add and not to_remove:
        return  # idempotent — no DB writes, no audit rows

    # Apply changes
    for code in to_remove:
        role = Role.objects.get(org_id=target.org_id, code=code)
        UserRole.objects.filter(user=target, role=role).delete()
        audit.append(
            org_id=target.org_id,
            action="user.role_revoked",
            entity="user_role",
            entity_id=target.id,
            before={"role_code": code},
            actor_id=actor.id,
        )
    for code in to_add:
        role = found_by_code[code]
        UserRole.objects.create(user=target, role=role, granted_by=actor)
        audit.append(
            org_id=target.org_id,
            action="user.role_granted",
            entity="user_role",
            entity_id=target.id,
            after={"role_code": code},
            actor_id=actor.id,
        )
