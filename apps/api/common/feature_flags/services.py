"""Feature-flag business logic.

is_enabled(org_id, key)         -> effective enabled (with cascade)
set_enabled(org_id, key, bool)  -> updates DB + cache + audit
list_for_org(org_id)            -> registry joined with org's rows
"""

from __future__ import annotations

from uuid import UUID

from django.db import transaction

from common.feature_flags import cache as cache_helpers
from common.feature_flags.exceptions import CriticalModuleError, UnknownModuleKeyError
from common.feature_flags.models import FeatureFlag
from common.feature_flags.registry import (
    CRITICAL_MODULES,
    DERIVED_MODULES,
    TOGGLABLE_MODULES,
)


def _is_own_enabled(org_id: UUID, key: str) -> bool:
    cached = cache_helpers.get(org_id, key)
    if cached is not None:
        return cached
    flag = FeatureFlag.objects.filter(org_id=org_id, key=key).first()
    enabled = flag.enabled if flag else True
    cache_helpers.set_(org_id, key, enabled)
    return enabled


def is_enabled(org_id: UUID, key: str) -> bool:
    """Critical -> always True. Togglable -> own state + cascade. Derived -> any of deps."""
    if key in CRITICAL_MODULES:
        return True

    if key in TOGGLABLE_MODULES:
        if not _is_own_enabled(org_id, key):
            return False
        for dep in TOGGLABLE_MODULES[key]["depends_on"]:
            if not is_enabled(org_id, dep):
                return False
        return True

    if key in DERIVED_MODULES:
        return any(is_enabled(org_id, dep) for dep in DERIVED_MODULES[key]["depends_on_any"])

    return True  # unknown -- fail open


def set_enabled(org_id: UUID, key: str, enabled: bool, *, actor) -> FeatureFlag:
    """Persist the enabled state. Refuses critical disables."""
    from common.audit import service as audit

    if key in CRITICAL_MODULES and not enabled:
        raise CriticalModuleError(f"Cannot disable critical module '{key}'")

    if key not in TOGGLABLE_MODULES and key not in CRITICAL_MODULES:
        raise UnknownModuleKeyError(f"Unknown module key '{key}'")

    with transaction.atomic():
        prior = FeatureFlag.objects.filter(org_id=org_id, key=key).first()
        before = {"enabled": prior.enabled} if prior else None

        flag, _created = FeatureFlag.objects.update_or_create(
            org_id=org_id,
            key=key,
            defaults={"enabled": enabled, "updated_by": actor},
        )
        cache_helpers.invalidate(org_id, key)
        for dep_key, dep_meta in TOGGLABLE_MODULES.items():
            if key in dep_meta["depends_on"]:
                cache_helpers.invalidate(org_id, dep_key)

    audit.append(
        org_id=org_id,
        action="feature_flag.changed",
        entity="feature_flag",
        entity_id=flag.id,
        before=before,
        after={"key": key, "enabled": enabled},
        actor_id=actor.id if actor else None,
    )
    return flag


def list_for_org(org_id: UUID) -> list[dict]:
    """Returns all 15 entries (10 togglable + 3 critical + 2 derived)."""
    out = []

    for key, meta in TOGGLABLE_MODULES.items():
        out.append(
            {
                "key": key,
                "label": meta["label"],
                "enabled": is_enabled(org_id, key),
                "togglable": True,
                "critical": False,
                "derived": False,
                "depends_on": meta["depends_on"],
            }
        )

    for key in sorted(CRITICAL_MODULES):
        out.append(
            {
                "key": key,
                "label": key.title(),
                "enabled": True,
                "togglable": False,
                "critical": True,
                "derived": False,
                "depends_on": [],
            }
        )

    for key, meta in DERIVED_MODULES.items():
        out.append(
            {
                "key": key,
                "label": meta["label"],
                "enabled": is_enabled(org_id, key),
                "togglable": False,
                "critical": False,
                "derived": True,
                "depends_on_any": meta["depends_on_any"],
            }
        )

    return out
