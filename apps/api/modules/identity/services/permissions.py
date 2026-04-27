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
