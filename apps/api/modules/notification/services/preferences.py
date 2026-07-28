"""Notification preferences -- system default catalogue + helpers."""

from __future__ import annotations

from modules.notification.models import NotificationPreference
from modules.notification.registry import REGISTRY

# (type, in_app_default, email_default, security_relevant) — derived from registry.
DEFAULT_PREFERENCES: list[tuple[str, bool, bool, bool]] = [
    (n.type, n.in_app_default, n.email_default, n.security) for n in REGISTRY
]

SECURITY_TYPES: frozenset[str] = frozenset(n.type for n in REGISTRY if n.security)


def is_security_type(type_code: str) -> bool:
    return type_code in SECURITY_TYPES


def default_for(type_code: str, channel: str) -> bool:
    for t, in_app, email, _ in DEFAULT_PREFERENCES:
        if t == type_code:
            return in_app if channel == "in_app" else email
    return True  # unknown type: opt-in by default


def is_enabled(*, user, type_code: str, channel: str) -> bool:
    """True if user wants this notification on this channel.

    Security-relevant types always return True regardless of preference.
    """
    if is_security_type(type_code):
        return True
    pref = NotificationPreference.objects.filter(
        user=user,
        type=type_code,
        channel=channel,
    ).first()
    if pref is not None:
        return pref.enabled
    return default_for(type_code, channel)


def seed_for_user(user) -> int:
    """Seed default preferences for a freshly-created user. Idempotent."""
    n_created = 0
    for type_code, in_app, email, _ in DEFAULT_PREFERENCES:
        for channel, enabled in [("in_app", in_app), ("email", email)]:
            _, created = NotificationPreference.objects.get_or_create(
                user=user,
                type=type_code,
                channel=channel,
                defaults={"enabled": enabled},
            )
            if created:
                n_created += 1
    return n_created
