"""Shared user-provisioning service (v1.11.0).

Both creation paths — employee-first and user-first — call `provision_user`.
It creates a User in an org, assigns one role, writes an audit row, busts the
perm cache, and handles two credential methods:

- "invite": create the user with an UNUSABLE password, then trigger the
  existing password-reset email so they set their own password.
- "temp": set a provided temp password and flag `must_change_password=True`.
"""

from __future__ import annotations

from django.db import transaction
from rest_framework.exceptions import ValidationError

from common.audit.service import append as audit_append
from modules.identity.models import Role, User, UserRole
from modules.identity.services.auth import initiate_password_reset
from modules.identity.services.permissions import invalidate_user_perms


class UserAlreadyExists(ValidationError):  # noqa: N818 — name is part of the service contract (used by later v1.11.0 tasks)
    """Raised when an active user with the given email already exists in the org."""

    def __init__(self, email: str):
        super().__init__(
            {"email": f"A user with email {email} already exists. Link instead."}
        )


@transaction.atomic
def provision_user(
    *,
    org_id,
    email,
    role_code,
    credential_method,
    temp_password=None,
    actor_id=None,
) -> User:
    """Create a User in the org, assign one role, audit, and set credentials.

    Raises:
        UserAlreadyExists: an active (non-soft-deleted) user with this email exists.
        ValidationError: unknown role, bad credential_method, or missing temp_password.
    """
    if User.objects.filter(
        org_id=org_id, email__iexact=email, deleted_at__isnull=True
    ).exists():
        raise UserAlreadyExists(email)

    role = Role.objects.filter(org_id=org_id, code=role_code).first()
    if role is None:
        raise ValidationError({"role_code": f"Unknown role '{role_code}'."})

    if credential_method == "temp":
        if not temp_password:
            raise ValidationError(
                {"temp_password": "Required for temp credential method."}
            )
        user = User.objects.create_user(
            email=email, password=temp_password, org_id=org_id
        )
        user.must_change_password = True
        user.save(update_fields=["must_change_password", "updated_at"])
    elif credential_method == "invite":
        user = User.objects.create_user(email=email, password=None, org_id=org_id)
        user.set_unusable_password()
        user.save(update_fields=["password", "updated_at"])
    else:
        raise ValidationError({"credential_method": "Must be 'invite' or 'temp'."})

    UserRole.objects.create(user=user, role=role, granted_by_id=actor_id)
    invalidate_user_perms(user.id)

    audit_append(
        org_id=org_id,
        action="user.created",
        entity="user",
        entity_id=user.id,
        after={"email": email, "role_code": role_code, "credential_method": credential_method},
        actor_id=actor_id,
    )

    if credential_method == "invite":
        initiate_password_reset(email=email)

    return user
