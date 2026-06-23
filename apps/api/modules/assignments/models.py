"""Action Center assignments — general link-based mandatory tasks (v1)."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import ClassVar

from django.db import models
from django.utils import timezone

TYPES: ClassVar = [("task", "Task"), ("acknowledge", "Acknowledge")]
LINK_TARGETS: ClassVar = [("none", "None"), ("internal", "Internal"), ("external", "External")]
ASSIGNMENT_STATUS: ClassVar = [
    ("draft", "Draft"),
    ("published", "Published"),
    ("archived", "Archived"),
]
RECIPIENT_STATUS: ClassVar = [("pending", "Pending"), ("completed", "Completed")]


class Assignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    type = models.CharField(max_length=16, choices=TYPES, default="task")
    link_url = models.CharField(max_length=1000, blank=True)
    link_target = models.CharField(max_length=16, choices=LINK_TARGETS, default="none")
    default_due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=ASSIGNMENT_STATUS, default="draft")
    created_by = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "assignment"
        ordering: ClassVar = ["-created_at"]
        indexes: ClassVar = [models.Index(fields=["org_id", "status"])]

    def __str__(self) -> str:
        return f"{self.title} ({self.status})"


class AssignmentRecipient(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    assignment = models.ForeignKey(
        Assignment, on_delete=models.CASCADE, related_name="recipients"
    )
    employee_id = models.UUIDField(db_index=True)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=RECIPIENT_STATUS, default="pending")
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_ip = models.CharField(max_length=64, blank=True)
    note = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = "assignment_recipient"
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=["assignment", "employee_id"], name="assignment_recipient_unique"
            ),
        ]
        indexes: ClassVar = [models.Index(fields=["employee_id", "status"])]

    def __str__(self) -> str:
        return f"{self.assignment_id}/{self.employee_id}/{self.status}"

    @property
    def effective_status(self) -> str:
        """Derives 'overdue' without a cron flip (mirrors Invitation.effective_status)."""
        if self.status == "pending" and self.due_date and self.due_date < dt.date.today():
            return "overdue"
        return self.status
