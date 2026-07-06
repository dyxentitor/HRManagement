"""Company announcement model."""

from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.utils import timezone

from common.models import TenantBaseModel

CATEGORIES: ClassVar[tuple] = (
    ("policy", "Policy"),
    ("event", "Event"),
    ("maintenance", "Maintenance"),
    ("holiday", "Holiday"),
    ("general", "General"),
)

PRIORITIES: ClassVar[tuple] = (("low", "Low"), ("normal", "Normal"), ("high", "High"))

STATUSES: ClassVar[tuple] = (
    ("draft", "Draft"),
    ("scheduled", "Scheduled"),
    ("published", "Published"),
    ("archived", "Archived"),
)

AUDIENCE_TYPES: ClassVar[tuple] = (
    ("all", "Everyone"),
    ("departments", "Departments"),
    ("roles", "Roles"),
    ("teams", "Teams"),
    ("employees", "Specific employees"),
)


class Announcement(TenantBaseModel):
    title = models.CharField(max_length=200)
    body = models.TextField()
    category = models.CharField(max_length=16, choices=CATEGORIES, default="general")
    priority = models.CharField(max_length=8, choices=PRIORITIES, default="normal")
    status = models.CharField(max_length=12, choices=STATUSES, default="draft")
    pinned = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    audience_type = models.CharField(max_length=16, choices=AUDIENCE_TYPES, default="all")
    audience_spec = models.JSONField(default=list, blank=True)
    created_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "announcement"
        indexes: ClassVar[list] = [
            models.Index(fields=["org_id", "-published_at"]),
            models.Index(fields=["org_id", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.category})"


class AnnouncementRead(models.Model):
    """Per-(user, announcement) read receipt."""

    id = models.BigAutoField(primary_key=True)
    org_id = models.UUIDField(db_index=True)
    announcement = models.ForeignKey(
        Announcement, on_delete=models.CASCADE, related_name="reads"
    )
    user_id = models.UUIDField(db_index=True)
    read_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "announcement_read"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["announcement", "user_id"], name="announcement_read_unique"
            )
        ]

    def __str__(self) -> str:
        return f"read({self.announcement_id} by {self.user_id})"


class AnnouncementAttachment(models.Model):
    """File attached to an announcement (S3-backed, claims-attachment pattern)."""

    id = models.BigAutoField(primary_key=True)
    announcement = models.ForeignKey(
        Announcement, on_delete=models.CASCADE, related_name="attachments"
    )
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=128)
    size_bytes = models.BigIntegerField(default=0)
    s3_key = models.CharField(max_length=500)
    uploaded_by = models.UUIDField(null=True, blank=True)
    uploaded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "announcement_attachment"

    def __str__(self) -> str:
        return self.filename
