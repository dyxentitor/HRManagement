"""TenantContext middleware — sets the thread-local org_id during each request."""

from __future__ import annotations

from collections.abc import Callable

from common.managers import clear_current_org_id, set_current_org_id


class TenantContextMiddleware:
    """For authenticated requests, set the thread-local org_id from request.user.

    Anonymous requests leave the context unset — `TenantScopedManager` returns
    empty querysets in that case, which is the safe default.

    The middleware MUST run AFTER `AuthenticationMiddleware`/DRF auth so that
    `request.user` is populated.
    """

    def __init__(self, get_response: Callable) -> None:
        self.get_response = get_response

    def __call__(self, request):
        org_id = None
        user = getattr(request, "user", None)
        if user and getattr(user, "is_authenticated", False):
            org_id = getattr(user, "org_id", None)

        set_current_org_id(org_id)
        try:
            return self.get_response(request)
        finally:
            clear_current_org_id()
