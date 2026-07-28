"""Action Center assignments — general link-based mandatory tasks (v1)."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import ClassVar

from django.db import models
from django.utils import timezone

TYPES: ClassVar = [
    ("task", "Task"),
    ("acknowledge", "Acknowledge"),
    ("questionnaire", "Questionnaire"),
]
QUESTION_TYPES: ClassVar = [
    ("single_choice", "Single choice"),
    ("multi_choice", "Multiple choice"),
    ("short_text", "Short text"),
    ("rating", "Rating (1-5)"),
]
LINK_TARGETS: ClassVar = [("none", "None"), ("internal", "Internal"), ("external", "External")]
ASSIGNMENT_STATUS: ClassVar = [
    ("draft", "Draft"),
    ("published", "Published"),
    ("archived", "Archived"),
]
RECIPIENT_STATUS: ClassVar = [("pending", "Pending"), ("completed", "Completed")]
RECURRENCE: ClassVar = [
    ("none", "None"),
    ("daily", "Daily"),
    ("weekly", "Weekly"),
    ("monthly", "Monthly"),
    ("yearly", "Yearly"),
]


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
    # Completion auto-detection (Phase 4): a trigger key; "manual" = self-attest.
    complete_on = models.CharField(max_length=32, default="manual")
    # Evidence + versioning (Phase 6).
    requires_evidence = models.BooleanField(default=False)
    version = models.PositiveIntegerField(default=1)
    # Recurrence (Phase 3): a recurring assignment is a template that spawns instances.
    recurrence = models.CharField(max_length=12, choices=RECURRENCE, default="none")
    recurrence_interval = models.PositiveIntegerField(default=1)
    recurrence_until = models.DateField(null=True, blank=True)
    target_spec = models.JSONField(default=dict, blank=True)  # {kind, ids} for re-fan-out
    is_template = models.BooleanField(default=False)
    next_run_at = models.DateField(null=True, blank=True)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="instances"
    )
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
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="recipients")
    employee_id = models.UUIDField(db_index=True)
    due_date = models.DateField(null=True, blank=True)
    last_reminded_on = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=RECIPIENT_STATUS, default="pending")
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_ip = models.CharField(max_length=64, blank=True)
    note = models.CharField(max_length=500, blank=True)
    evidence_s3_key = models.CharField(max_length=500, blank=True)
    acked_version = models.PositiveIntegerField(default=1)
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


class AssignmentQuestion(models.Model):
    """A question on a questionnaire-type assignment (Phase 2)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="questions")
    order = models.PositiveIntegerField(default=0)
    text = models.CharField(max_length=500)
    qtype = models.CharField(max_length=16, choices=QUESTION_TYPES, default="single_choice")
    options = models.JSONField(default=list, blank=True)  # choice labels (choice types)
    required = models.BooleanField(default=True)

    class Meta:
        db_table = "assignment_question"
        ordering: ClassVar = ["order"]

    def __str__(self) -> str:
        return f"{self.assignment_id}/Q{self.order}"


class AssignmentResponse(models.Model):
    """A recipient's answer to one question (attributed)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    recipient = models.ForeignKey(
        AssignmentRecipient, on_delete=models.CASCADE, related_name="responses"
    )
    question = models.ForeignKey(
        AssignmentQuestion, on_delete=models.CASCADE, related_name="responses"
    )
    answer = models.JSONField(default=dict)  # str | list[str] | int, wrapped as {"value": …}
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = "assignment_response"
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=["recipient", "question"], name="assignment_response_unique"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.recipient_id}/{self.question_id}"
