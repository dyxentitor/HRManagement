"""Notification routing — org-level gates, delivery lanes, and CC resolution."""

from __future__ import annotations

import logging

from django.core.validators import EmailValidator

from modules.identity.models import User

from ..models import Notification, NotificationRouting
from ..registry import BY_TYPE
from .recipients import role_users

logger = logging.getLogger(__name__)


def default_routing(org_id, type_code: str) -> NotificationRouting:
    """An unsaved instance carrying the model defaults for (org, type).

    Both kill-switches default open — the registry's `*_default` flags govern
    personal preferences, not this gate.
    """
    return NotificationRouting(org_id=org_id, type=type_code)


def routing_for(org_id, type_code: str) -> NotificationRouting:
    """The stored routing row, or an unsaved instance carrying the defaults.

    Never returns None and never writes.
    """
    row = NotificationRouting.objects.filter(org_id=org_id, type=type_code).first()
    if row is not None:
        return row
    return default_routing(org_id, type_code)


def routing_map(org_id) -> dict[str, NotificationRouting]:
    """Every stored routing row for *org_id*, keyed by type. One query.

    Callers that need all 35 registry types should pair this with
    `default_routing()` for the misses rather than looping `routing_for()`.
    """
    return {r.type: r for r in NotificationRouting.objects.filter(org_id=org_id)}


# Braced token -> (role code, display label). Available on every type.
ROLE_TOKENS: dict[str, tuple[str, str]] = {
    "{hr_managers}": ("hr_manager", "HR managers"),
    "{org_admins}": ("org_admin", "Org admins"),
    "{finance}": ("finance", "Finance"),
}

# Bare name -> display label. Resolved from Notification.cc_context, so a type
# may only offer one if its emitting call site supplies the binding.
CONTEXT_TOKEN_LABELS: dict[str, str] = {
    "approver": "Approver",
    "requester": "Requester",
}


def available_tokens(type_code: str) -> list[dict[str, str]]:
    """Tokens configurable on *type_code*: its context tokens, then role tokens."""
    n = BY_TYPE.get(type_code)
    context = n.context_tokens if n is not None else ()
    out = [
        {"token": f"{{{name}}}", "label": CONTEXT_TOKEN_LABELS[name]}
        for name in context
        if name in CONTEXT_TOKEN_LABELS
    ]
    out.extend({"token": token, "label": label} for token, (_, label) in ROLE_TOKENS.items())
    return out


def is_token(entry: str) -> bool:
    return entry.startswith("{") and entry.endswith("}")


def is_valid_token(type_code: str, entry: str) -> bool:
    return any(t["token"] == entry for t in available_tokens(type_code))


def _resolve_entry(entry: str, n: Notification) -> list[str]:
    if not is_token(entry):
        return [entry]
    if entry in ROLE_TOKENS:
        code, _ = ROLE_TOKENS[entry]
        return [e for e in role_users(n.org_id, code).values_list("email", flat=True) if e]
    name = entry[1:-1]
    if name in CONTEXT_TOKEN_LABELS:
        user_id = (n.cc_context or {}).get(name)
        if not user_id:
            logger.debug("CC token %s unbound on notification %s", entry, n.id)
            return []
        u = User.objects.filter(id=user_id, org_id=n.org_id).first()
        if u is None or not u.email:
            logger.debug("CC token %s resolved to no address on notification %s", entry, n.id)
            return []
        return [u.email]
    logger.debug("Unknown CC token %s on notification %s", entry, n.id)
    return []


def resolve_cc(n: Notification) -> list[str]:
    """Resolved CC addresses for *n* — deduped, minus the To address."""
    entries = routing_for(n.org_id, n.type).cc_entries or []
    if not entries:
        return []
    seen = {(n.user.email or "").lower()}
    out: list[str] = []
    for entry in entries:
        for addr in _resolve_entry(entry, n):
            key = (addr or "").lower()
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(addr)
    return out


def validate_entry(type_code: str, entry: str) -> None:
    """Raise django ValidationError when *entry* is neither a valid token nor an email."""
    if is_token(entry):
        if not is_valid_token(type_code, entry):
            from django.core.exceptions import ValidationError

            raise ValidationError(f"{entry} is not available on {type_code}")
        return
    EmailValidator()(entry)
