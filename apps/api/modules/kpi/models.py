"""KPI models — templates, definitions, cycles, assignments, reviews."""

from __future__ import annotations

from typing import ClassVar

from django.db import models

from common.models import TenantBaseModel

METRIC_TYPES: tuple = (
    ("numeric", "Numeric"),
    ("percentage", "Percentage"),
    ("rating", "Rating"),
    ("boolean", "Boolean"),
)
CYCLE_TYPES: tuple = (
    ("quarterly", "Quarterly"),
    ("semi_annual", "Semi-annual"),
    ("annual", "Annual"),
)
CYCLE_STATUSES: tuple = (
    ("upcoming", "Upcoming"),
    ("self_review", "Self review"),
    ("manager_review", "Manager review"),
    ("closed", "Closed"),
)
ASSIGNMENT_STATUSES: tuple = (
    ("pending", "Pending"),
    ("self_done", "Self done"),
    ("manager_done", "Manager done"),
    ("closed", "Closed"),
)
REVIEW_STAGES: tuple = (
    ("self", "Self"),
    ("manager", "Manager"),
    ("final", "Final"),
)


class KpiTemplate(TenantBaseModel):
    name = models.CharField(max_length=128)
    description = models.TextField(blank=True)
    applies_to_role_id = models.UUIDField(null=True, blank=True)
    applies_to_dept_id = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "kpi_template"
        indexes: ClassVar[list] = [models.Index(fields=["org_id"])]

    def __str__(self) -> str:
        return f"Template({self.name})"


class KpiDefinition(models.Model):
    """Per-template KPI definition. Snapshotted into assignments at assign time."""

    id = models.BigAutoField(primary_key=True)
    template = models.ForeignKey(KpiTemplate, on_delete=models.CASCADE, related_name="definitions")
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=128)
    description = models.TextField(blank=True)
    metric_type = models.CharField(max_length=16, choices=METRIC_TYPES)
    target = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    unit = models.CharField(max_length=32, blank=True)
    weight = models.DecimalField(max_digits=5, decimal_places=2, default=1)
    evidence_required = models.BooleanField(default=False)
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = "kpi_definition"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["template", "code"], name="kpi_def_unique_code_per_template"
            ),
        ]
        ordering: ClassVar[list] = ["sort_order"]

    def __str__(self) -> str:
        return f"{self.code}/{self.template.name}"


class KpiCycle(TenantBaseModel):
    name = models.CharField(max_length=128)
    type = models.CharField(max_length=16, choices=CYCLE_TYPES)
    starts_on = models.DateField()
    ends_on = models.DateField()
    review_opens_on = models.DateField()
    review_closes_on = models.DateField()
    status = models.CharField(max_length=20, choices=CYCLE_STATUSES, default="upcoming")

    class Meta:
        db_table = "kpi_cycle"
        indexes: ClassVar[list] = [models.Index(fields=["org_id", "-starts_on"])]

    def __str__(self) -> str:
        return f"{self.name} ({self.type}, {self.status})"


class KpiAssignment(TenantBaseModel):
    cycle = models.ForeignKey(KpiCycle, on_delete=models.CASCADE, related_name="assignments")
    employee_id = models.UUIDField()
    template = models.ForeignKey(KpiTemplate, on_delete=models.PROTECT, related_name="assignments")
    kpis = models.JSONField(default=list)  # snapshot of definitions at assign time
    status = models.CharField(max_length=16, choices=ASSIGNMENT_STATUSES, default="pending")

    class Meta:
        db_table = "kpi_assignment"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["cycle", "employee_id"],
                condition=models.Q(deleted_at__isnull=True),
                name="kpi_assignment_unique_cycle_emp",
            ),
        ]
        indexes: ClassVar[list] = [models.Index(fields=["employee_id", "cycle"])]

    def __str__(self) -> str:
        return f"Assignment({self.employee_id}, cycle={self.cycle_id})"


class KpiReview(models.Model):
    """One review iteration per (assignment, stage). Multiple iterations supported."""

    id = models.BigAutoField(primary_key=True)
    assignment = models.ForeignKey(KpiAssignment, on_delete=models.CASCADE, related_name="reviews")
    iteration = models.IntegerField(default=1)
    stage = models.CharField(max_length=8, choices=REVIEW_STAGES)
    scores = models.JSONField(default=dict)  # {"<kpi_code>": {"score": 4.5, "comment": "..."}}
    overall_comment = models.TextField(blank=True)
    evidence = models.JSONField(default=list)  # list of s3_keys
    submitted_by = models.UUIDField()
    submitted_at = models.DateTimeField(auto_now_add=True)
    ai_summary_id = models.UUIDField(null=True, blank=True)  # Phase 2 hook

    class Meta:
        db_table = "kpi_review"
        indexes: ClassVar[list] = [models.Index(fields=["assignment", "iteration"])]

    def __str__(self) -> str:
        return f"Review({self.assignment_id}, it={self.iteration}, stage={self.stage})"


class KpiReviewIteration(models.Model):
    """Audit row for each review iteration's change summary."""

    id = models.BigAutoField(primary_key=True)
    review = models.ForeignKey(KpiReview, on_delete=models.CASCADE, related_name="iterations")
    change_summary = models.JSONField(default=dict)
    ts = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "kpi_review_iteration"

    def __str__(self) -> str:
        return f"ReviewIteration({self.review_id}, ts={self.ts})"
