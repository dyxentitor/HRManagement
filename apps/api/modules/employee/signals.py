"""Signals that emit audit-log rows on Employee changes."""

from __future__ import annotations

import datetime
import uuid
from typing import Any

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from common.audit import append

from .models import Employee

# Fields we care about for diffing on update.
TRACKED_FIELDS = (
    "first_name",
    "last_name",
    "preferred_name",
    "email",
    "phone",
    "alt_phone",
    "ic_last4",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "postcode",
    "country_code",
    "department_id",
    "manager_id",
    "role_title",
    "employment_type",
    "schedule_type",
    "probation_end_date",
    "contract_end_date",
    "confirmed_at",
    "bank_name",
    "bank_account_last4",
    "emergency_contact_name",
    "emergency_contact_relationship",
    "emergency_contact_phone",
    "status",
)


def _to_json(val: Any) -> Any:
    """Convert a field value to a JSON-safe type."""
    if isinstance(val, uuid.UUID):
        return str(val)
    if isinstance(val, datetime.date | datetime.datetime):
        return val.isoformat()
    return val


def _snapshot(instance: Employee) -> dict[str, Any]:
    return {f: _to_json(getattr(instance, f)) for f in TRACKED_FIELDS}


@receiver(pre_save, sender=Employee)
def _capture_pre_save_snapshot(sender, instance: Employee, **kwargs) -> None:
    """Stash the persisted state on the instance so post_save can diff."""
    if instance.pk is None:
        instance._pre_save_snapshot = None
        return
    try:
        existing = Employee.all_objects.get(pk=instance.pk)
        snap = _snapshot(existing)
        snap["deleted_at"] = existing.deleted_at
        instance._pre_save_snapshot = snap
    except Employee.DoesNotExist:
        instance._pre_save_snapshot = None


@receiver(post_save, sender=Employee)
def _audit_employee_save(sender, instance: Employee, created: bool, **kwargs) -> None:
    if created:
        append(
            org_id=instance.org_id,
            action="employee.created",
            entity="employees",
            entity_id=instance.id,
            before=None,
            after=_snapshot(instance),
        )
        return

    before = getattr(instance, "_pre_save_snapshot", None)
    after = _snapshot(instance)
    if before is None:
        return

    # Detect soft-delete: deleted_at went from None → not-None.
    pre_deleted = before.get("deleted_at") if isinstance(before, dict) else None
    if instance.deleted_at is not None and pre_deleted is None:
        append(
            org_id=instance.org_id,
            action="employee.archived",
            entity="employees",
            entity_id=instance.id,
            before={k: v for k, v in before.items() if k != "deleted_at"},
            after=after,
        )
        return

    # Diff tracked fields
    diff_before = {
        k: v for k, v in before.items() if k != "deleted_at" and before.get(k) != after.get(k)
    }
    diff_after = {k: after[k] for k in diff_before}
    if not diff_before:
        return  # no tracked-field change

    append(
        org_id=instance.org_id,
        action="employee.updated",
        entity="employees",
        entity_id=instance.id,
        before=diff_before,
        after=diff_after,
    )
