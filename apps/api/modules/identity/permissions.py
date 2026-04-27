"""HRMSPermission — DRF permission class enforcing perms + tenant scope + data scope."""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import BasePermission

from common.managers import set_current_org_id
from modules.identity.services.permissions import get_user_perms


class HRMSPermission(BasePermission):
    """Three-stage gate:

    1. User holds all the codes in `view.required_perms`.
    2. (object level) `obj.org_id == request.user.org_id` for tenant safety.
    3. Future: data-scope check (self/team/org) — handled by `has_object_permission`
       in M2+ when the Employee model exists.

    Views opt in by setting a `required_perms: list[str]` attribute. Views that
    don't set it require authentication only.

    Note: this class also re-sets the thread-local org_id from the DRF-resolved
    user, since `TenantContextMiddleware` runs before DRF's JWT authentication
    resolves `request.user`. The middleware handles cleanup (clear_current_org_id)
    in its `finally` block, so the context is still properly torn down.
    """

    message = "You do not have permission to perform this action."

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and getattr(user, "is_authenticated", False)):
            return False
        # Re-set the org context now that DRF has resolved the authenticated user.
        # The middleware may have set it to None (session user = anonymous) if JWT
        # was used — correct it here so TenantScopedManager scopes correctly.
        org_id = getattr(user, "org_id", None)
        set_current_org_id(org_id)
        required: list[str] = getattr(view, "required_perms", []) or []
        if not required:
            return True
        user_perms = get_user_perms(user)
        return all(code in user_perms for code in required)

    def has_object_permission(self, request, view, obj: Any) -> bool:
        # Tenant scope: same-org only (defense in depth — querysets are also scoped).
        org_id = getattr(obj, "org_id", None)
        user_org = getattr(request.user, "org_id", None)
        if org_id is not None and user_org is not None and org_id != user_org:
            return False
        return True
