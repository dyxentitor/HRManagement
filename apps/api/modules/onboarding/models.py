"""Employee onboarding checklist + items."""

from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.utils import timezone

from common.models import TenantBaseModel

CHECKLIST_STATUSES: ClassVar[tuple] = (
    ("in_progress", "In progress"),
    ("completed", "Completed"),
)

# Default item template seeded when a checklist is created.
DEFAULT_ITEMS: ClassVar[tuple] = (
    "Sign employment contract",
    "Upload IC / passport",
    "Submit bank details",
    "IT account setup",
    "Office / facilities tour",
    "First-week check-in",
)


class OnboardingChecklist(TenantBaseModel):
    employee_id = models.UUIDField()
    status = models.CharField(max_length=16, choices=CHECKLIST_STATUSES, default="in_progress")
    started_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "onboarding_checklist"
        indexes: ClassVar[list] = [
            models.Index(fields=["org_id", "status"]),
        ]

    def __str__(self) -> str:
        return f"Onboarding({self.employee_id}, {self.status})"


class OnboardingItem(TenantBaseModel):
    checklist = models.ForeignKey(
        OnboardingChecklist, on_delete=models.CASCADE, related_name="items"
    )
    label = models.CharField(max_length=200)
    done = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "onboarding_item"
        ordering: ClassVar[list] = ["order"]

    def __str__(self) -> str:
        return f"{self.label} ({'done' if self.done else 'pending'})"
