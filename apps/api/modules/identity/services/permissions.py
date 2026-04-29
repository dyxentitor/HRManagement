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


# --- Admin: role permission editor --------------------------------------


# Permissions that org_admin must never lose (Section 5 rule 1 in spec).
ORG_ADMIN_REQUIRED_PERMS = frozenset(
    {
        "role:read",
        "role:write",
        "org:feature_flag:read",
        "org:feature_flag:write",
    }
)


class UnknownPermissionError(Exception):
    pass


class OrgAdminProtectionError(Exception):
    pass


class LastWritePermissionHolderError(Exception):
    pass


def _is_protected_admin_perm(code: str) -> bool:
    """org_admin must keep these. Includes any identity:* perm."""
    return code in ORG_ADMIN_REQUIRED_PERMS or code.startswith("identity:")


def set_role_permissions(*, actor, role_code: str, permission_codes: list[str]):
    """Replace the role's permission set within the actor's org.

    - Validates every code exists in the catalogue.
    - org_admin must keep ORG_ADMIN_REQUIRED_PERMS + all identity:* perms.
    - At least one role in the org must continue to hold each non-read permission being removed.
    - Audit row: role.permissions_changed with {before, after} payloads.
    - Idempotent.

    Raises UnknownPermissionError, OrgAdminProtectionError,
    LastWritePermissionHolderError.
    """
    from common.audit import service as audit
    from modules.identity.models import Permission, Role, RolePermission

    permission_codes = list(dict.fromkeys(permission_codes))

    # Validate every code is in the catalogue
    found = set(
        Permission.objects.filter(code__in=permission_codes).values_list("code", flat=True),
    )
    missing = [c for c in permission_codes if c not in found]
    if missing:
        raise UnknownPermissionError(f"Unknown permission code(s): {', '.join(missing)}")

    role = Role.objects.get(org_id=actor.org_id, code=role_code)
    requested = set(permission_codes)
    current = set(
        RolePermission.objects.filter(role=role).values_list("permission__code", flat=True),
    )
    to_add = requested - current
    to_remove = current - requested

    # Guard 1: org_admin keeps required perms
    if role_code == "org_admin":
        stripping_protected = [c for c in to_remove if _is_protected_admin_perm(c)]
        if stripping_protected:
            raise OrgAdminProtectionError(
                f"org_admin must retain identity admin perms: {sorted(stripping_protected)}",
            )

    # Guard 2: at least one role must hold each mutating (non-read) perm
    for code in to_remove:
        if ":read" in code:
            continue
        # Count OTHER roles in the same org that hold this perm
        other_holders = (
            RolePermission.objects.filter(
                role__org_id=actor.org_id,
                permission__code=code,
            )
            .exclude(role_id=role.id)
            .exists()
        )
        if not other_holders:
            raise LastWritePermissionHolderError(
                f"This change would leave nobody able to {code}. "
                f"Grant {code} to another role first.",
            )

    if not to_add and not to_remove:
        return  # idempotent — no audit, no DB writes

    # Apply
    if to_remove:
        RolePermission.objects.filter(
            role=role,
            permission__code__in=to_remove,
        ).delete()
    if to_add:
        perm_ids = list(
            Permission.objects.filter(code__in=to_add).values_list("id", flat=True),
        )
        RolePermission.objects.bulk_create(
            [RolePermission(role=role, permission_id=pid) for pid in perm_ids],
            ignore_conflicts=True,
        )

    audit.append(
        org_id=actor.org_id,
        action="role.permissions_changed",
        entity="role",
        entity_id=role.id,
        before={"role_code": role_code, "permissions": sorted(current)},
        after={"role_code": role_code, "permissions": sorted(requested)},
        actor_id=actor.id,
    )


def reset_role_to_defaults(*, actor, role_code: str):
    """Re-apply the fixture's default perms for this role, dropping admin edits.

    The fixture at modules/identity/fixtures/default_roles.yaml is the
    single source of truth for "default" role permission sets.
    """
    from pathlib import Path

    import yaml

    from common.audit import service as audit
    from modules.identity.models import Permission, Role, RolePermission

    fixture_path = Path(__file__).resolve().parent.parent / "fixtures" / "default_roles.yaml"
    with fixture_path.open() as f:
        entries = yaml.safe_load(f)
    entry = next((e for e in entries if e["code"] == role_code), None)
    if entry is None:
        raise UnknownRoleError(f"No default fixture for role code: {role_code}")

    role = Role.objects.get(org_id=actor.org_id, code=role_code)
    prev_codes = sorted(
        RolePermission.objects.filter(role=role).values_list("permission__code", flat=True),
    )
    wanted_codes = sorted(entry.get("permissions", []))
    perm_ids = list(
        Permission.objects.filter(code__in=wanted_codes).values_list("id", flat=True),
    )

    # Replace
    RolePermission.objects.filter(role=role).delete()
    RolePermission.objects.bulk_create(
        [RolePermission(role=role, permission_id=pid) for pid in perm_ids],
        ignore_conflicts=True,
    )

    audit.append(
        org_id=actor.org_id,
        action="role.reset_to_defaults",
        entity="role",
        entity_id=role.id,
        before={"role_code": role_code, "permissions": prev_codes},
        after={"role_code": role_code, "permissions": wanted_codes},
        actor_id=actor.id,
    )
