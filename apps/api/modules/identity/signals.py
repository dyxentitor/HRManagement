"""Signals that invalidate the permission cache when role/user-role membership changes."""

from __future__ import annotations

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from modules.identity.models import RolePermission, UserRole
from modules.identity.services.permissions import (
    invalidate_role_users,
    invalidate_user_perms,
)


@receiver([post_save, post_delete], sender=UserRole)
def _on_user_role_change(sender, instance: UserRole, **kwargs) -> None:
    invalidate_user_perms(instance.user_id)


@receiver([post_save, post_delete], sender=RolePermission)
def _on_role_permission_change(sender, instance: RolePermission, **kwargs) -> None:
    invalidate_role_users(instance.role_id)
