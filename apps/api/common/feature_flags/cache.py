"""Redis cache for feature-flag lookups. 60s TTL, key ff:{org_id}:{key}."""

from __future__ import annotations

from uuid import UUID

from django.core.cache import cache

TTL_SECONDS = 60


def _key(org_id: UUID, module_key: str) -> str:
    return f"ff:{org_id}:{module_key}"


def get(org_id: UUID, module_key: str) -> bool | None:
    """Returns True/False if cached, None if not cached."""
    val = cache.get(_key(org_id, module_key))
    if val is None:
        return None
    return val == "1"


def set_(org_id: UUID, module_key: str, enabled: bool) -> None:
    cache.set(_key(org_id, module_key), "1" if enabled else "0", TTL_SECONDS)


def invalidate(org_id: UUID, module_key: str) -> None:
    cache.delete(_key(org_id, module_key))
