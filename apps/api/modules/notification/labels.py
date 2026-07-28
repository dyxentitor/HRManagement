"""Derived label accessors — see modules.notification.registry (the source of truth)."""

from __future__ import annotations

from modules.notification.registry import (  # noqa: F401  (re-exported for existing importers)
    DOMAIN_LABELS,
    EVENT_LABELS,
    domain_label,
    domain_of,
    label_for,
)
