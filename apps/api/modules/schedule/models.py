"""Schedule models — WorkSchedule, Shift, ShiftAssignment, Holiday."""

from __future__ import annotations

from typing import ClassVar

from django.db import models

from common.models import TenantBaseModel

SHIFT_ASSIGNMENT_STATUSES: ClassVar[tuple] = (
    ("scheduled", "Scheduled"),
    ("completed", "Completed"),
    ("absent", "Absent"),
    ("cancelled", "Cancelled"),
)
HOLIDAY_TYPES: ClassVar[tuple] = (
    ("federal", "Federal"),
    ("state", "State"),
    ("company", "Company"),
)


class WorkSchedule(TenantBaseModel):
    """Per-employee weekly working pattern.

    `pattern` is a JSONB dict keyed by lowercase weekday: mon/tue/wed/thu/fri/sat/sun.
    Each value is `{"start": "HH:MM", "end": "HH:MM"}`. Missing days mean off.
    """

    employee = models.ForeignKey(
        "employee.Employee", on_delete=models.CASCADE, related_name="work_schedules"
    )
    name = models.CharField(max_length=64, default="Default")
    pattern = models.JSONField(default=dict)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "schedule_work_schedule"
        indexes: ClassVar[list] = [
            models.Index(fields=["employee", "effective_from"]),
        ]

    def __str__(self) -> str:
        return f"{self.employee.employee_code}/{self.name}"


class Shift(TenantBaseModel):
    """Org-defined shift template (e.g., "Morning 09:00-18:00")."""

    name = models.CharField(max_length=64)
    start_time = models.TimeField()
    end_time = models.TimeField()
    crosses_midnight = models.BooleanField(default=False)
    code = models.CharField(max_length=3)
    color = models.CharField(max_length=7, default="#3B82F6")

    class Meta:
        db_table = "schedule_shift"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["org_id", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="shift_unique_name_per_org",
            ),
            models.UniqueConstraint(
                fields=["org_id", "code"],
                condition=models.Q(deleted_at__isnull=True),
                name="shift_unique_code_per_org",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.code:
            self.code = self.code.upper()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.name} ({self.start_time}-{self.end_time})"


class ShiftAssignment(TenantBaseModel):
    """One employee x one date -> one shift assignment."""

    employee = models.ForeignKey(
        "employee.Employee", on_delete=models.CASCADE, related_name="shift_assignments"
    )
    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, related_name="assignments")
    work_date = models.DateField()
    status = models.CharField(max_length=16, choices=SHIFT_ASSIGNMENT_STATUSES, default="scheduled")
    assigned_by = models.UUIDField()
    published_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    covering_for = models.ForeignKey(
        "employee.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="covered_by",
    )

    class Meta:
        db_table = "schedule_shift_assignment"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["employee", "work_date"],
                condition=models.Q(deleted_at__isnull=True),
                name="shift_assignment_unique_emp_date",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["org_id", "work_date"]),
            models.Index(fields=["employee", "work_date"]),
            models.Index(fields=["shift", "work_date"]),
        ]

    @property
    def is_published(self) -> bool:
        return self.published_at is not None

    def clean(self):
        from django.core.exceptions import ValidationError

        super().clean()
        if self.covering_for_id is not None and self.covering_for_id == self.employee_id:
            raise ValidationError(
                {"covering_for": "An employee cannot cover for themselves."},
            )

    def __str__(self) -> str:
        return f"{self.employee.employee_code}/{self.work_date}/{self.shift.name}"


class Holiday(TenantBaseModel):
    """Org's effective holiday list. Populated from country_holidays + company adds."""

    date = models.DateField()
    name = models.CharField(max_length=128)
    type = models.CharField(max_length=8, choices=HOLIDAY_TYPES)
    applies_to_country_code = models.CharField(max_length=2, blank=True)
    applies_to_state_code = models.CharField(max_length=8, blank=True)

    class Meta:
        db_table = "schedule_holiday"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["org_id", "date", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="holiday_unique_org_date_name",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["org_id", "date"]),
        ]

    def __str__(self) -> str:
        return f"{self.date}: {self.name}"
