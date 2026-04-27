"""AttendanceRecord — one row per (employee, work_date)."""

from __future__ import annotations

from typing import ClassVar

from django.db import models

from common.models import TenantBaseModel

SOURCE_CHOICES: ClassVar[tuple] = (
    ("web", "Web"),
    ("kiosk", "Kiosk"),
    ("mobile", "Mobile"),
    ("admin", "Admin"),
)
STATUS_CHOICES: ClassVar[tuple] = (
    ("present", "Present"),
    ("late", "Late"),
    ("absent", "Absent"),
    ("holiday", "Holiday"),
    ("on_leave", "On leave"),
    ("partial", "Partial"),
)


class AttendanceRecord(TenantBaseModel):
    employee = models.ForeignKey(
        "employee.Employee", on_delete=models.CASCADE, related_name="attendance_records"
    )
    work_date = models.DateField()
    clock_in = models.DateTimeField(null=True, blank=True)
    clock_out = models.DateTimeField(null=True, blank=True)
    source = models.CharField(max_length=8, choices=SOURCE_CHOICES, default="web")
    is_holiday_work = models.BooleanField(default=False)
    holiday_id = models.UUIDField(null=True, blank=True)
    shift_assignment_id = models.UUIDField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="absent")
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "attendance_record"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["employee", "work_date"],
                condition=models.Q(deleted_at__isnull=True),
                name="attendance_unique_emp_date",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["org_id", "employee", "-work_date"]),
            models.Index(fields=["org_id", "work_date"]),
        ]

    @property
    def computed_hours(self):
        """Decimal hours between clock_in and clock_out."""
        if self.clock_in and self.clock_out:
            delta = self.clock_out - self.clock_in
            return round(delta.total_seconds() / 3600, 2)
        return None

    def recompute_status(self) -> None:
        """Set the status from clock_in/out + flags. Called by service after writes."""
        if self.clock_in is None and self.clock_out is None:
            self.status = "absent"
        elif self.clock_in is not None and self.clock_out is not None:
            # Both present → present (late detection requires schedule lookup; M5+ feature)
            self.status = "present"
        else:
            # Only one of clock_in / clock_out is set
            self.status = "partial"

    def __str__(self) -> str:
        return f"{self.employee.employee_code}/{self.work_date}/{self.status}"
