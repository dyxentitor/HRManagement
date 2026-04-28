"""Reporting infrastructure models — saved views + export jobs."""

from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.utils import timezone

JOB_STATUSES: ClassVar[tuple] = (
    ("pending", "Pending"),
    ("running", "Running"),
    ("done", "Done"),
    ("failed", "Failed"),
)


class SavedView(models.Model):
    """User x report-code x filter combo."""

    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="saved_views",
    )
    report_code = models.CharField(max_length=64)
    name = models.CharField(max_length=128)
    filters = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "report_saved_view"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["user", "report_code", "name"],
                name="saved_view_unique_user_report_name",
            ),
        ]
        indexes: ClassVar[list] = [models.Index(fields=["user", "report_code"])]

    def __str__(self) -> str:
        return f"SavedView({self.report_code}/{self.name})"


class ReportExportJob(models.Model):
    """Async export job tracking."""

    id = models.BigAutoField(primary_key=True)
    org_id = models.UUIDField(db_index=True)
    user = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="report_jobs",
    )
    report_code = models.CharField(max_length=64)
    filters = models.JSONField(default=dict)
    format = models.CharField(max_length=8)  # csv|xlsx|pdf
    status = models.CharField(max_length=8, choices=JOB_STATUSES, default="pending")
    s3_key = models.CharField(max_length=500, blank=True)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "report_export_job"
        indexes: ClassVar[list] = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self) -> str:
        return f"ExportJob({self.report_code}/{self.format}/{self.status})"
