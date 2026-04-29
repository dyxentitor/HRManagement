import uuid

from django.db import models


class FeatureFlag(models.Model):
    """Per-org module enable/disable. Absent row = enabled by default."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    key = models.CharField(max_length=64)
    enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        "identity.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        db_table = "feature_flags"
        unique_together = (("org_id", "key"),)
        indexes = (models.Index(fields=["org_id", "key"]),)

    def __str__(self) -> str:
        return f"{self.key}@{self.org_id}={'on' if self.enabled else 'off'}"
