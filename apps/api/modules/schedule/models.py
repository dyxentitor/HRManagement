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

    def save(self, *args, **kwargs):
        if self.covering_for_id is not None and self.covering_for_id == self.employee_id:
            from django.core.exceptions import ValidationError

            raise ValidationError(
                {"covering_for": "An employee cannot cover for themselves."},
            )
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.employee.employee_code}/{self.work_date}/{self.shift.name}"


SWAP_STATUSES: ClassVar[tuple] = (
    ("pending", "Pending"),
    ("approved", "Approved"),
    ("rejected", "Rejected"),
    ("cancelled", "Cancelled"),
)


class ShiftSwapRequest(TenantBaseModel):
    """An employee's request to swap one of their shifts with a teammate's.

    The swap exchanges the (work_date, shift) pair between the two assignment
    rows — each employee keeps their own row. See
    docs/superpowers/specs/2026-08-18-shift-swap-design.md §5.
    """

    requester_assignment = models.ForeignKey(
        ShiftAssignment, on_delete=models.PROTECT, related_name="swap_requests_made"
    )
    counterparty_assignment = models.ForeignKey(
        ShiftAssignment, on_delete=models.PROTECT, related_name="swap_requests_received"
    )
    requester = models.ForeignKey(
        "employee.Employee", on_delete=models.PROTECT, related_name="swap_requests_made"
    )
    counterparty = models.ForeignKey(
        "employee.Employee", on_delete=models.PROTECT, related_name="swap_requests_received"
    )
    reason = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=SWAP_STATUSES, default="pending")
    decided_by = models.UUIDField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True, default="")

    class Meta:
        db_table = "schedule_shift_swap_request"
        indexes: ClassVar[list] = [
            models.Index(fields=["org_id", "status"]),
            models.Index(fields=["requester", "-created_at"]),
            models.Index(fields=["counterparty", "-created_at"]),
        ]

    def __str__(self) -> str:
        return (
            f"{self.requester.employee_code} <-> {self.counterparty.employee_code} ({self.status})"
        )


class Holiday(TenantBaseModel):
    """Org's effective holiday list. Populated from country_holidays + company adds.

    `source` records who put the row here, which is what makes reconcile safe:
    an import may only touch rows it owns (`SOURCE_IMPORT`). Company-authored
    rows, company exclusions and confirmed overrides are never overwritten —
    a disagreement is reported as a conflict instead.
    """

    SOURCE_COMPANY = "company"
    SOURCE_OVERRIDE = "override"
    SOURCE_IMPORT = "import"
    SOURCE_LEGACY = "legacy"
    SOURCES: ClassVar[tuple] = (
        (SOURCE_COMPANY, "Company-created"),
        (SOURCE_OVERRIDE, "Organization override"),
        (SOURCE_IMPORT, "Imported from provider"),
        (SOURCE_LEGACY, "Legacy fixture"),
    )
    # Rows an automated import is forbidden to modify or withdraw.
    PROTECTED_SOURCES: ClassVar[frozenset] = frozenset({SOURCE_COMPANY, SOURCE_OVERRIDE})

    date = models.DateField()
    name = models.CharField(max_length=128)
    type = models.CharField(max_length=8, choices=HOLIDAY_TYPES)
    applies_to_country_code = models.CharField(max_length=2, blank=True)
    applies_to_state_code = models.CharField(max_length=8, blank=True)

    # --- provenance (v1.84.0) -------------------------------------------
    source = models.CharField(max_length=16, choices=SOURCES, default=SOURCE_LEGACY)
    # Internal CANONICAL identity (see common/holidays/canonical.py). Stable
    # across renames, languages, provider swaps and date corrections. Blank for
    # company-created rows, which have no upstream identity by definition.
    source_key = models.CharField(max_length=200, blank=True, db_index=True)
    # The upstream provider's OWN identity, kept verbatim for audit. Never used
    # for matching — that is source_key's job.
    external_id = models.CharField(max_length=200, blank=True)
    # Which day of a multi-day festival this is (1-based).
    occurrence = models.PositiveSmallIntegerField(default=1)
    source_provider = models.CharField(max_length=64, blank=True)
    source_version = models.CharField(max_length=32, blank=True)
    imported_at = models.DateTimeField(null=True, blank=True)
    # Full ISO 3166-2 (e.g. "MY-10"); blank means national scope.
    applies_to_subdivision_code = models.CharField(max_length=16, blank=True)
    observed = models.BooleanField(default=False)
    # An unconfirmed date (provider-estimated, or gazetted "tertakluk kepada
    # perubahan"). Provisional rows are INVISIBLE to employees until an
    # administrator confirms them — see `published`.
    provisional = models.BooleanField(default=False)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.UUIDField(null=True, blank=True)
    # A company exclusion: "this imported day is NOT a holiday for us."
    # Kept as a row so a re-import cannot silently resurrect the day.
    excluded = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "schedule_holiday"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["org_id", "date", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="holiday_unique_org_date_name",
            ),
            # The identity that survives a date change.
            models.UniqueConstraint(
                fields=["org_id", "source_key"],
                condition=models.Q(deleted_at__isnull=True) & ~models.Q(source_key=""),
                name="holiday_unique_org_source_key",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["org_id", "date"]),
        ]

    def __str__(self) -> str:
        return f"{self.date}: {self.name}"

    @property
    def is_protected(self) -> bool:
        """True when an automated import must leave this row alone.

        `type == "company"` counts even when `source` says otherwise: rows that
        predate provenance all carry `source="legacy"`, so the type column is
        the only surviving evidence that a human authored them.
        """
        return self.source in self.PROTECTED_SOURCES or self.type == "company" or self.excluded

    @property
    def published(self) -> bool:
        """True when this day is visible to employees.

        An excluded day is not a holiday for this org, and a provisional day
        is not yet a fact — neither may reach attendance, leave or an
        employee-facing calendar.
        """
        return not self.excluded and not self.provisional


def published_holidays(*, org_id, **extra):
    """The single queryset every employee-facing surface must use.

    Centralised deliberately: the provisional/excluded gate is a correctness
    rule, and duplicating the filter across calendar / attendance / dashboard
    is how one of them eventually forgets it.
    """
    return Holiday.all_objects.filter(
        org_id=org_id,
        deleted_at__isnull=True,
        excluded=False,
        provisional=False,
        **extra,
    )
