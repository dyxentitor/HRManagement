"""Leave data layer: types, policies, balances, ledger."""

from __future__ import annotations

from decimal import Decimal
from typing import ClassVar

from django.db import models

from common.models import TenantBaseModel

ACCRUAL_TYPES: ClassVar[tuple] = (
    ("annual", "Annual"),
    ("monthly", "Monthly"),
    ("event_based", "Event-based"),
    ("none", "No accrual"),
)
GENDER_RESTRICTION_CHOICES: ClassVar[tuple] = (
    ("any", "Any"),
    ("male", "Male only"),
    ("female", "Female only"),
)
LEDGER_REASONS: ClassVar[tuple] = (
    ("accrual", "Accrual"),
    ("request_approved", "Request approved"),
    ("request_cancelled", "Request cancelled"),
    ("carry_forward", "Carry forward"),
    ("holiday_replacement", "Holiday replacement"),
    ("manual_adjustment", "Manual adjustment"),
)


class LeaveType(TenantBaseModel):
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=64)
    accrual_type = models.CharField(max_length=16, choices=ACCRUAL_TYPES)
    default_days = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))
    is_paid = models.BooleanField(default=True)
    requires_attachment = models.BooleanField(default=False)
    max_consecutive_days = models.IntegerField(null=True, blank=True)
    min_advance_notice_days = models.IntegerField(default=0)
    carry_forward_max = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))
    is_statutory = models.BooleanField(default=False)
    gender_restriction = models.CharField(
        max_length=8, choices=GENDER_RESTRICTION_CHOICES, default="any"
    )
    # v1.8.0 additions
    carry_forward_expiry_months = models.IntegerField(null=True, blank=True)
    requires_service_months = models.IntegerField(default=0)
    notice_days_required = models.IntegerField(default=0)
    max_per_lifetime_events = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "leave_type"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["org_id", "code"],
                condition=models.Q(deleted_at__isnull=True),
                name="leave_type_unique_code_per_org",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code} ({self.name})"


class LeavePolicy(TenantBaseModel):
    leave_type = models.ForeignKey(LeaveType, on_delete=models.PROTECT, related_name="policies")
    applies_to_role_id = models.UUIDField(null=True, blank=True)
    applies_to_department_id = models.UUIDField(null=True, blank=True)
    days_per_year = models.DecimalField(max_digits=5, decimal_places=2)
    tenure_brackets = models.JSONField(default=list, blank=True)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "leave_policy"
        indexes: ClassVar[list] = [
            models.Index(fields=["leave_type", "effective_from"]),
        ]

    def __str__(self) -> str:
        return f"Policy({self.leave_type.code}, {self.days_per_year}d/y)"


class LeaveBalance(TenantBaseModel):
    employee_id = models.UUIDField()
    leave_type = models.ForeignKey(LeaveType, on_delete=models.PROTECT, related_name="balances")
    year = models.IntegerField()
    entitled = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0"))
    accrued = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0"))
    taken = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0"))
    pending = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0"))
    carried_forward = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0"))

    class Meta:
        db_table = "leave_balance"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["employee_id", "leave_type", "year"],
                condition=models.Q(deleted_at__isnull=True),
                name="leave_balance_unique_emp_type_year",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["employee_id", "year"]),
        ]

    @property
    def available(self) -> Decimal:
        return self.accrued + self.carried_forward - self.taken - self.pending

    def __str__(self) -> str:
        return f"{self.employee_id}/{self.leave_type.code}/{self.year}"


class LeaveBalanceLedger(models.Model):
    """Append-only ledger of every change to a leave balance.

    Idempotency: (reference_type, reference_id, reason) is unique. Re-running
    an event-driven grant (e.g., HolidayWorkConfirmed) is a no-op.
    """

    id = models.BigAutoField(primary_key=True)
    org_id = models.UUIDField(db_index=True)
    employee_id = models.UUIDField()
    leave_type = models.ForeignKey(
        LeaveType, on_delete=models.PROTECT, related_name="ledger_entries"
    )
    delta = models.DecimalField(max_digits=6, decimal_places=2)
    reason = models.CharField(max_length=32, choices=LEDGER_REASONS)
    reference_type = models.CharField(max_length=64, null=True, blank=True)  # noqa: DJ001
    reference_id = models.UUIDField(null=True, blank=True)
    actor_id = models.UUIDField(null=True, blank=True)
    ts = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "leave_balance_ledger"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["reference_type", "reference_id", "reason"],
                condition=(~models.Q(reference_type=None) & ~models.Q(reference_id=None)),
                name="leave_ledger_unique_per_reference",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["employee_id", "leave_type", "-ts"]),
        ]

    def __str__(self) -> str:
        return f"{self.employee_id}/{self.leave_type.code}/{self.delta}/{self.reason}"


class LeaveRequest(TenantBaseModel):
    REQUEST_STATUSES: ClassVar[tuple] = (
        ("draft", "Draft"),
        ("submitted", "Submitted"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("cancelled", "Cancelled"),
        ("withdrawn", "Withdrawn"),
    )
    HALF_DAY_PERIOD_CHOICES: ClassVar[tuple] = (
        ("am", "AM"),
        ("pm", "PM"),
    )

    employee_id = models.UUIDField()
    leave_type = models.ForeignKey(LeaveType, on_delete=models.PROTECT, related_name="requests")
    start_date = models.DateField()
    end_date = models.DateField()
    total_days = models.DecimalField(max_digits=5, decimal_places=2)
    is_half_day = models.BooleanField(default=False)
    half_day_period = models.CharField(max_length=2, choices=HALF_DAY_PERIOD_CHOICES, blank=True)
    reason = models.TextField(blank=True)
    attachment_url = models.URLField(blank=True)
    status = models.CharField(max_length=16, choices=REQUEST_STATUSES, default="draft")
    current_level = models.IntegerField(default=0)
    submitted_at = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "leave_request"
        indexes: ClassVar[list] = [
            models.Index(fields=["employee_id", "-submitted_at"]),
            models.Index(fields=["status", "current_level"]),
            models.Index(fields=["org_id", "status"]),
        ]

    # Implements WorkflowSubject Protocol
    @property
    def employee(self):
        from modules.employee.models import Employee

        return Employee.all_objects.get(id=self.employee_id)

    def __str__(self) -> str:
        return (
            f"LeaveRequest({self.employee_id}, {self.leave_type.code},"
            f" {self.start_date}..{self.end_date})"
        )


class LeaveApproval(models.Model):
    APPROVAL_STATUSES: ClassVar[tuple] = (
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("delegated", "Delegated"),
        ("skipped", "Skipped"),
    )

    id = models.BigAutoField(primary_key=True)
    leave_request = models.ForeignKey(
        LeaveRequest, on_delete=models.CASCADE, related_name="approvals"
    )
    level = models.IntegerField()
    approver_id = models.UUIDField()
    status = models.CharField(max_length=16, choices=APPROVAL_STATUSES, default="pending")
    comment = models.TextField(blank=True)
    acted_at = models.DateTimeField(null=True, blank=True)
    delegated_to = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "leave_approval"
        indexes: ClassVar[list] = [
            models.Index(fields=["leave_request", "level"]),
            models.Index(fields=["approver_id", "status"]),
        ]

    def __str__(self) -> str:
        return f"LeaveApproval(req={self.leave_request_id}, level={self.level}, {self.status})"


class EmployeeLeaveOverride(TenantBaseModel):
    """Per-employee custom entitlement that overrides the tenure-tier policy.

    Resolution priority at year-start accrual: override (this) > LeavePolicy.tenure_brackets
    > LeaveType.default_days. History is preserved by soft-delete + (optional) effective_to.
    """

    employee_id = models.UUIDField()
    leave_type = models.ForeignKey(LeaveType, on_delete=models.PROTECT, related_name="overrides")
    days_override = models.DecimalField(max_digits=5, decimal_places=2)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    note = models.TextField(blank=True)
    created_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "employee_leave_override"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["employee_id", "leave_type", "effective_from"],
                condition=models.Q(deleted_at__isnull=True),
                name="emp_leave_override_unique",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["employee_id", "leave_type"]),
        ]

    def __str__(self) -> str:
        return (
            f"Override(emp={self.employee_id}, {self.leave_type.code}, "
            f"{self.days_override}d, from {self.effective_from})"
        )
