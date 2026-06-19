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


class Announcement(TenantBaseModel):
    title = models.CharField(max_length=200)
    body = models.TextField()
    category = models.CharField(max_length=16, choices=CATEGORIES, default="general")
    pinned = models.BooleanField(default=False)
    published_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "announcement"
        indexes: ClassVar[list] = [
            models.Index(fields=["org_id", "-published_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.category})"
