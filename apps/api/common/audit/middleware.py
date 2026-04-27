"""AuditContextMiddleware — captures actor + ip + user_agent into thread-local."""

from __future__ import annotations

import threading
import uuid
from collections.abc import Callable

_local = threading.local()


def get_current_actor_id() -> uuid.UUID | None:
    return getattr(_local, "actor_id", None)


def get_current_ip() -> str | None:
    return getattr(_local, "ip", None)


def get_current_user_agent() -> str | None:
    return getattr(_local, "user_agent", None)


def set_audit_context(actor_id: uuid.UUID | None, ip: str | None, ua: str | None) -> None:
    _local.actor_id = actor_id
    _local.ip = ip
    _local.user_agent = ua


def clear_audit_context() -> None:
    _local.actor_id = None
    _local.ip = None
    _local.user_agent = None


class AuditContextMiddleware:
    def __init__(self, get_response: Callable) -> None:
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        actor_id = (
            getattr(user, "id", None)
            if (user and getattr(user, "is_authenticated", False))
            else None
        )

        fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
        ip = fwd.split(",")[0].strip() if fwd else request.META.get("REMOTE_ADDR")

        ua = request.META.get("HTTP_USER_AGENT", "")[:1024]

        set_audit_context(actor_id, ip, ua)
        try:
            return self.get_response(request)
        finally:
            clear_audit_context()
