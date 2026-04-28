"""Notification + NotificationPreference + EmailDigestRun."""

from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.utils import timezone

CHANNELS: ClassVar[tuple] = (("in_app", "In-app"), ("email", "Email"))
PRIORITIES: ClassVar[tuple] = (
    ("low", "Low"),
    ("normal", "Normal"),
    ("high", "High"),
    ("urgent", "Urgent"),
)
DELIVERY_STATUSES: ClassVar[tuple] = (
    ("pending", "Pending"),
    ("sent", "Sent"),
    ("failed", "Failed"),
    ("skipped", "Skipped"),
)


class Notification(models.Model):
    """Individual notification row.

    Created by `notify()` for each (user x channel) combination matching the
    user's preferences. In-app notifications are visible to the user immediately;
    email-channel rows are picked up by the hourly digest task.
    """

    id = models.BigAutoField(primary_key=True)
    org_id = models.UUIDField(db_index=True)
    user = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField(max_length=64)  # e.g. 'leave.approved'
    channel = models.CharField(max_length=16, choices=CHANNELS)
    payload = models.JSONField(default=dict)
    deep_link = models.CharField(max_length=500, blank=True)
    priority = models.CharField(max_length=8, choices=PRIORITIES, default="normal")
    delivery_status = models.CharField(max_length=16, choices=DELIVERY_STATUSES, default="pending")
    sent_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "notification"
        indexes: ClassVar[list] = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["user", "channel", "delivery_status"]),
            models.Index(fields=["user", "read_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.type}/{self.channel}/{self.user.email}"

    def mark_read(self) -> None:
        if self.read_at is None:
            self.read_at = timezone.now()
            self.save(update_fields=["read_at"])


class NotificationPreference(models.Model):
    """User x type x channel preference. Missing rows = use system default."""

    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="notification_preferences",
    )
    type = models.CharField(max_length=64)
    channel = models.CharField(max_length=16, choices=CHANNELS)
    enabled = models.BooleanField(default=True)

    class Meta:
        db_table = "notification_preference"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["user", "type", "channel"],
                name="notification_pref_unique_user_type_channel",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user.email}/{self.type}/{self.channel}"


class EmailDigestRun(models.Model):
    """One row per user per digest send (audit). Tracks which notifications were bundled."""

    id = models.BigAutoField(primary_key=True)
    org_id = models.UUIDField(db_index=True)
    user = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="email_digest_runs",
    )
    notification_count = models.IntegerField(default=0)
    sent_at = models.DateTimeField(default=timezone.now)
    notifications = models.ManyToManyField(Notification, related_name="digest_runs")

    class Meta:
        db_table = "notification_email_digest_run"
        indexes: ClassVar[list] = [models.Index(fields=["user", "-sent_at"])]

    def __str__(self) -> str:
        return f"DigestRun/{self.user.email}/{self.sent_at}"
