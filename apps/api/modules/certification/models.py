"""Certification + training models."""

from __future__ import annotations

from typing import ClassVar

from django.db import models

from common.models import TenantBaseModel

CERT_STATUSES: ClassVar[tuple] = (
    ("active", "Active"),
    ("expired", "Expired"),
    ("revoked", "Revoked"),
)
TRAINING_ASSIGNMENT_STATUSES: ClassVar[tuple] = (
    ("assigned", "Assigned"),
    ("in_progress", "In progress"),
    ("completed", "Completed"),
    ("overdue", "Overdue"),
)


class Certification(TenantBaseModel):
    employee_id = models.UUIDField()
    name = models.CharField(max_length=200)
    issuer = models.CharField(max_length=200, blank=True)
    certificate_number = models.CharField(max_length=100, blank=True)
    issued_on = models.DateField()
    expires_on = models.DateField(null=True, blank=True)
    document_s3_key = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=16, choices=CERT_STATUSES, default="active")
    reminder_sent_30d = models.BooleanField(default=False)
    reminder_sent_60d = models.BooleanField(default=False)
    reminder_sent_90d = models.BooleanField(default=False)

    class Meta:
        db_table = "certification"
        indexes: ClassVar[list] = [
            models.Index(fields=["employee_id"]),
            models.Index(fields=["org_id", "expires_on"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.employee_id})"


class TrainingPlan(TenantBaseModel):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    required_for_role_id = models.UUIDField(null=True, blank=True)
    required_for_dept_id = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "training_plan"

    def __str__(self) -> str:
        return self.name


class TrainingAssignment(TenantBaseModel):
    plan = models.ForeignKey(TrainingPlan, on_delete=models.CASCADE, related_name="assignments")
    employee_id = models.UUIDField()
    assigned_by = models.UUIDField()
    due_date = models.DateField()
    status = models.CharField(
        max_length=16, choices=TRAINING_ASSIGNMENT_STATUSES, default="assigned"
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    evidence_s3_key = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = "training_assignment"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["plan", "employee_id"],
                condition=models.Q(deleted_at__isnull=True),
                name="training_assignment_unique_plan_emp",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["employee_id", "status"]),
            models.Index(fields=["org_id", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.plan.name}/{self.employee_id}/{self.status}"


class TrainingProgress(models.Model):
    id = models.BigAutoField(primary_key=True)
    assignment = models.ForeignKey(
        TrainingAssignment, on_delete=models.CASCADE, related_name="progress"
    )
    progress_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    ts = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "training_progress"
        indexes: ClassVar[list] = [models.Index(fields=["assignment", "-ts"])]

    def __str__(self) -> str:
        return f"Progress({self.assignment_id}, {self.progress_pct}%)"
