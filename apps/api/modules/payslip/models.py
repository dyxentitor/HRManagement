"""Payroll + payslip models."""

from __future__ import annotations

from typing import ClassVar

from django.db import models

from common.models import TenantBaseModel

PERIOD_TYPES: ClassVar[tuple] = (
    ("monthly", "Monthly"),
    ("bi_weekly", "Bi-weekly"),
)
PERIOD_STATUSES: ClassVar[tuple] = (
    ("draft", "Draft"),
    ("approved", "Approved"),
    ("ready", "Ready"),
    ("processing", "Processing"),
    ("completed", "Completed"),
)
COMPONENT_TYPES: ClassVar[tuple] = (
    ("earning", "Earning"),
    ("deduction", "Deduction"),
    ("employer_contribution", "Employer contribution"),
)
PAYSLIP_STATUSES: ClassVar[tuple] = (
    ("draft", "Draft"),
    ("published", "Published"),
    ("sent", "Sent"),
)
PAYSLIP_SOURCES: ClassVar[tuple] = (
    ("csv_import", "CSV import"),
    ("manual", "Manual"),
)
RUN_STATUSES: ClassVar[tuple] = (
    ("draft", "Draft"),
    ("validated", "Validated"),
    ("published", "Published"),
    ("failed", "Failed"),
)


class PayrollPeriod(TenantBaseModel):
    period_start = models.DateField()
    period_end = models.DateField()
    period_type = models.CharField(max_length=16, choices=PERIOD_TYPES)
    pay_date = models.DateField()
    status = models.CharField(max_length=16, choices=PERIOD_STATUSES, default="draft")
    approved_at = models.DateTimeField(null=True, blank=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    processing_started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "payroll_period"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["org_id", "period_start", "period_end"],
                condition=models.Q(deleted_at__isnull=True),
                name="payroll_period_unique_dates_per_org",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["org_id", "-period_start"]),
        ]

    def __str__(self) -> str:
        return f"{self.period_start}..{self.period_end} ({self.status})"


class PayrollComponent(TenantBaseModel):
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=24, choices=COMPONENT_TYPES)
    is_statutory = models.BooleanField(default=False)

    class Meta:
        db_table = "payroll_component"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["org_id", "code"],
                condition=models.Q(deleted_at__isnull=True),
                name="payroll_component_unique_code_per_org",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code} ({self.type})"


class PayslipRecord(TenantBaseModel):
    employee_id = models.UUIDField()
    period = models.ForeignKey(PayrollPeriod, on_delete=models.PROTECT, related_name="payslips")
    gross = models.DecimalField(max_digits=12, decimal_places=2)
    deductions = models.JSONField(default=dict, blank=True)
    net = models.DecimalField(max_digits=12, decimal_places=2)
    currency_code = models.CharField(max_length=3, default="MYR")
    components = models.JSONField(default=dict, blank=True)
    pdf_s3_key = models.CharField(max_length=500, blank=True)
    pdf_generated_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=PAYSLIP_STATUSES, default="draft")
    published_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    source = models.CharField(max_length=16, choices=PAYSLIP_SOURCES)

    class Meta:
        db_table = "payslip_record"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["employee_id", "period"],
                condition=models.Q(deleted_at__isnull=True),
                name="payslip_unique_emp_period",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["employee_id", "-period_id"]),
            models.Index(fields=["org_id", "status"]),
        ]

    def __str__(self) -> str:
        return (
            f"Payslip({self.employee_id}, " f"{self.period.period_start}..{self.period.period_end})"
        )


class PayrollRun(TenantBaseModel):
    """One CSV upload run. Stays in 'draft' until published.

    `errors` is a list of {row, error} dicts populated by the CSV importer.
    """

    period = models.ForeignKey(PayrollPeriod, on_delete=models.PROTECT, related_name="runs")
    uploaded_by = models.UUIDField()
    status = models.CharField(max_length=16, choices=RUN_STATUSES, default="draft")
    row_count = models.IntegerField(default=0)
    errors = models.JSONField(default=list, blank=True)
    csv_s3_key = models.CharField(max_length=500, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "payroll_run"

    def __str__(self) -> str:
        return f"Run({self.period}, {self.status}, rows={self.row_count})"
