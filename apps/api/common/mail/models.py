"""Per-org SMTP / email-notification configuration (singleton per org)."""

from __future__ import annotations

from typing import ClassVar

from django.db import models

from common.fields import EncryptedCharField
from common.models import BaseModel


class EmailConfiguration(BaseModel):
    ENCRYPTION_CHOICES: ClassVar = (
        ("none", "None"),
        ("ssl", "SSL/TLS"),
        ("starttls", "STARTTLS"),
    )

    org_id = models.UUIDField(unique=True, db_index=True, editable=False)
    enabled = models.BooleanField(default=False)

    smtp_host = models.CharField(max_length=255, blank=True)
    smtp_port = models.PositiveIntegerField(default=587)
    encryption = models.CharField(max_length=10, choices=ENCRYPTION_CHOICES, default="starttls")
    use_auth = models.BooleanField(default=True)
    smtp_username = models.CharField(max_length=255, blank=True)
    smtp_password = EncryptedCharField(max_length=255, null=True, blank=True)

    sender_name = models.CharField(max_length=255, blank=True)
    sender_email = models.EmailField(blank=True)
    reply_to = models.EmailField(blank=True)

    connection_timeout = models.PositiveIntegerField(default=10)
    rate_limit_per_minute = models.PositiveIntegerField(default=60)
    max_retry_attempts = models.PositiveIntegerField(default=3)
    retry_interval_seconds = models.PositiveIntegerField(default=60)
    signature = models.TextField(blank=True)
    accent_color = models.CharField(max_length=9, blank=True)  # #RRGGBB[AA]
    header_html = models.TextField(blank=True)
    footer_html = models.TextField(blank=True)
    provider_preset = models.CharField(max_length=32, blank=True)

    last_test_at = models.DateTimeField(null=True, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    last_failure_at = models.DateTimeField(null=True, blank=True)
    last_failure_message = models.CharField(max_length=500, blank=True)

    updated_by = models.ForeignKey(
        "identity.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        db_table = "email_configuration"

    def __str__(self) -> str:
        return f"EmailConfiguration(org={self.org_id}, host={self.smtp_host or '—'})"


class EmailTemplate(BaseModel):
    """Per-org override for a named transactional email template."""

    org_id = models.UUIDField(db_index=True, editable=False)
    key = models.CharField(max_length=64)
    subject = models.CharField(max_length=255, blank=True)
    html_body = models.TextField(blank=True)
    text_body = models.TextField(blank=True)

    class Meta:
        db_table = "email_template"
        unique_together = (("org_id", "key"),)

    def __str__(self) -> str:
        return f"EmailTemplate(org={self.org_id}, key={self.key})"
