"""ScheduleService — pattern lookup + bulk shift-assignment generation + publish."""

from __future__ import annotations

import datetime
import uuid

from django.db import transaction
from django.utils import timezone

from modules.employee.models import Employee

from ..models import ShiftAssignment, WorkSchedule

WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


class ScheduleService:
    @staticmethod
    def get_pattern_for_date(*, employee: Employee, on_date: datetime.date) -> dict | None:
        """Return the {start, end} pattern for the given date, or None if off."""
        ws = (
            WorkSchedule.all_objects.filter(
                employee=employee,
                deleted_at__isnull=True,
                effective_from__lte=on_date,
            )
            .order_by("-effective_from")
            .first()
        )
        if ws is None:
            return None
        if ws.effective_to is not None and ws.effective_to < on_date:
            return None
        weekday_key = WEEKDAY_KEYS[on_date.weekday()]
        return ws.pattern.get(weekday_key) or None

    @staticmethod
    @transaction.atomic
    def bulk_assign_pattern(
        *,
        org_id: uuid.UUID,
        employee_ids: list[uuid.UUID],
        pattern_by_weekday: dict[str, uuid.UUID],
        date_from: datetime.date,
        date_to: datetime.date,
        assigned_by: uuid.UUID,
        notes: str = "",
    ) -> int:
        """Generate ShiftAssignment rows for each (employee, date) where the
        date's weekday is in the pattern. Skips dates where an assignment
        already exists for that employee.
        """
        if date_to < date_from:
            raise ValueError("date_to must be on or after date_from")

        n_created = 0
        date = date_from
        while date <= date_to:
            weekday_key = WEEKDAY_KEYS[date.weekday()]
            shift_id = pattern_by_weekday.get(weekday_key)
            if shift_id is not None:
                for emp_id in employee_ids:
                    existing = ShiftAssignment.all_objects.filter(
                        org_id=org_id,
                        employee_id=emp_id,
                        work_date=date,
                        deleted_at__isnull=True,
                    ).first()
                    if existing is None:
                        ShiftAssignment.all_objects.create(
                            org_id=org_id,
                            employee_id=emp_id,
                            shift_id=shift_id,
                            work_date=date,
                            status="scheduled",
                            assigned_by=assigned_by,
                            notes=notes,
                        )
                        n_created += 1
            date += datetime.timedelta(days=1)
        return n_created

    @staticmethod
    def publish_for_period(
        *,
        org_id: uuid.UUID,
        date_from: datetime.date,
        date_to: datetime.date,
    ) -> int:
        """Stamp `published_at` on all unpublished scheduled assignments in the period."""
        return ShiftAssignment.all_objects.filter(
            org_id=org_id,
            work_date__gte=date_from,
            work_date__lte=date_to,
            published_at__isnull=True,
            status="scheduled",
            deleted_at__isnull=True,
        ).update(published_at=timezone.now())
