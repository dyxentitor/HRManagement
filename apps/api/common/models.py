"""Abstract base models used by every domain model in HRMS."""

from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone

from .managers import AllObjectsManager, SoftDeleteManager, TenantScopedManager


class BaseModel(models.Model):
    """Abstract base for global (org-agnostic) tables.

    Provides UUID primary key, created_at/updated_at timestamps, soft-delete column,
    and `objects` (alive only) + `all_objects` (incl. soft-deleted) managers.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True, editable=False)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True

    def delete(self, using: str | None = None, keep_parents: bool = False) -> None:  # type: ignore[override]
        """Soft delete: stamp deleted_at, do not remove the row."""
        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at", "updated_at"], using=using)

    def hard_delete(self, using: str | None = None, keep_parents: bool = False) -> None:
        """Real DELETE — escape hatch for hard removal (e.g., GDPR erasure)."""
        super().delete(using=using, keep_parents=keep_parents)


class TenantBaseModel(BaseModel):
    """Abstract base for tenant-scoped (org-bound) tables.

    Adds NOT NULL `org_id` and replaces the default manager with one that
    auto-filters by the thread-local org context.
    """

    org_id = models.UUIDField(editable=False, db_index=True)

    objects = TenantScopedManager()
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True
