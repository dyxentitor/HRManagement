"""Managers and thread-local org_id context for tenant-scoped querysets."""

from __future__ import annotations

import threading
import uuid
from typing import Any

from django.db import models
from django.utils import timezone

_local = threading.local()


def set_current_org_id(org_id: uuid.UUID | None) -> None:
    _local.org_id = org_id


def get_current_org_id() -> uuid.UUID | None:
    return getattr(_local, "org_id", None)


def clear_current_org_id() -> None:
    _local.org_id = None


class _SoftDeleteQuerySet(models.QuerySet):
    def alive(self) -> models.QuerySet:
        return self.filter(deleted_at__isnull=True)


class SoftDeleteManager(models.Manager):
    """Default manager: hides soft-deleted rows."""

    def get_queryset(self) -> models.QuerySet:
        return _SoftDeleteQuerySet(self.model, using=self._db).filter(deleted_at__isnull=True)


class AllObjectsManager(models.Manager):
    """Bypass manager: returns soft-deleted rows too."""

    def get_queryset(self) -> models.QuerySet:
        return _SoftDeleteQuerySet(self.model, using=self._db)


class TenantScopedManager(SoftDeleteManager):
    """Default manager for TenantBaseModel: hides soft-deleted AND scopes by current org_id.

    If no org_id is set in the current thread, returns an empty queryset
    (defense in depth — code paths that forget to set the org context
    cannot leak data across tenants).
    """

    def get_queryset(self) -> models.QuerySet:
        qs = super().get_queryset()
        org_id = get_current_org_id()
        if org_id is None:
            return qs.none()
        return qs.filter(org_id=org_id)


def utcnow() -> Any:
    return timezone.now()
