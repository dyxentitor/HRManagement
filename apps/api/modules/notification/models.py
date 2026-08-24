"""Notification + NotificationPreference + EmailDigestRun."""

from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.utils import timezone

from .registry import BY_TYPE

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
DELIVERY_MODES: ClassVar[tuple] = (
    ("auto", "Auto"),
    ("immediate", "Immediate"),
    ("digest", "Digest"),
)


def _is_security(type_code: str) -> bool:
    n = BY_TYPE.get(type_code)
    return bool(n and n.security)


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
    # Per-event bindings for CC context tokens, e.g. {"approver": "<user-uuid>"}.
    # Kept separate from `payload`, which cards.py reads to render the body.
    cc_context = models.JSONField(default=dict, blank=True)
    deep_link = models.CharField(max_length=500, blank=True)
    priority = models.CharField(max_length=8, choices=PRIORITIES, default="normal")
    delivery_status = models.CharField(max_length=16, choices=DELIVERY_STATUSES, default="pending")
    sent_at = models.DateTimeField(null=True, blank=True)
    send_attempts = models.PositiveSmallIntegerField(default=0)
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


class NotificationRouting(models.Model):
    """Per-org, per-type routing. A missing row means registry defaults.

    The two `*_enabled` flags are an org-level kill-switch layered on top of
    each user's `NotificationPreference`: org OFF suppresses the channel for
    everyone, org ON defers to the personal preference.
    """

    id = models.BigAutoField(primary_key=True)
    org_id = models.UUIDField(db_index=True)
    type = models.CharField(max_length=64)
    in_app_enabled = models.BooleanField(default=True)
    email_enabled = models.BooleanField(default=True)
    delivery = models.CharField(max_length=16, choices=DELIVERY_MODES, default="auto")
    cc_entries = models.JSONField(default=list, blank=True)
    updated_by = models.ForeignKey(
        "identity.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "notification_routing"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["org_id", "type"],
                name="notification_routing_unique_org_type",
            ),
        ]

    def __str__(self) -> str:
        return f"Routing(org={self.org_id}, type={self.type})"

    def channel_enabled(self, channel: str) -> bool:
        """Org-level gate. Security types can never be disabled on any channel.

        Mirrors `services.preferences.is_enabled`, which refuses to let a *user*
        opt out of a security type on either channel — the org gate must be no
        weaker, or an admin could silence a password-change notice entirely by
        clearing the in-app flag.
        """
        if _is_security(self.type):
            return True
        return self.email_enabled if channel == "email" else self.in_app_enabled

    def is_immediate(self, priority: str) -> bool:
        """True when this notification sends standalone rather than via digest."""
        if self.delivery == "digest":
            return False
        if self.delivery == "immediate":
            return True
        # "auto" — a CC list forces standalone (a digest can never carry a CC),
        # otherwise reproduce the pre-routing rule verbatim.
        if self.cc_entries:
            return True
        return _is_security(self.type) or priority in ("urgent", "high")
