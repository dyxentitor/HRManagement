from typing import ClassVar

from django.db import models

from common.models import TenantBaseModel

CATEGORY_CHOICES = (
    ("bug", "Bug Report"),
    ("feature", "Feature Request"),
    ("improvement", "Improvement/Enhancement"),
    ("uiux", "UI/UX Feedback"),
    ("performance", "Performance Issue"),
    ("security", "Security Concern"),
    ("documentation", "Documentation Issue"),
    ("general", "General Feedback"),
)
STATUS_CHOICES = (
    ("new", "New"),
    ("in_review", "In Review"),
    ("resolved", "Resolved"),
    ("closed", "Closed"),
)


class Feedback(TenantBaseModel):
    reporter = models.ForeignKey(
        "identity.User",
        on_delete=models.PROTECT,
        related_name="feedback_reports",
    )
    category = models.CharField(max_length=24, choices=CATEGORY_CHOICES)
    title = models.CharField(max_length=200)
    description = models.TextField()
    affected_module = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="new")
    assignee = models.ForeignKey(
        "identity.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="feedback_assigned",
    )

    class Meta:
        db_table = "feedback"
        indexes: ClassVar[list] = [
            models.Index(fields=["org_id", "status"]),
            models.Index(fields=["reporter", "-created_at"]),
            models.Index(fields=["org_id", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"Feedback({self.category}, {self.title!r}, {self.status})"


class FeedbackAttachment(models.Model):
    feedback = models.ForeignKey(Feedback, on_delete=models.CASCADE, related_name="attachments")
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size_bytes = models.BigIntegerField()
    s3_key = models.CharField(max_length=500)
    uploaded_by = models.UUIDField()
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "feedback_attachment"

    def __str__(self) -> str:
        return f"FeedbackAttachment({self.filename})"


class FeedbackNote(models.Model):
    feedback = models.ForeignKey(Feedback, on_delete=models.CASCADE, related_name="notes")
    author_id = models.UUIDField()
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "feedback_note"
        indexes: ClassVar[list] = [models.Index(fields=["feedback", "created_at"])]

    def __str__(self) -> str:
        return f"FeedbackNote(feedback={self.feedback_id})"
