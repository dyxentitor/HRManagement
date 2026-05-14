"""Organization + country reference models."""

from __future__ import annotations

from typing import ClassVar

from django.db import models

from common.models import BaseModel, TenantBaseModel


class Country(models.Model):
    """ISO 3166-1 alpha-2 country reference. Global, not org-scoped."""

    code = models.CharField(max_length=2, primary_key=True)
    name = models.CharField(max_length=128)
    default_currency = models.CharField(max_length=3)
    default_timezone = models.CharField(max_length=64)

    class Meta:
        ordering = ("code",)

    def __str__(self) -> str:
        return f"{self.code} {self.name}"


class CountryHoliday(models.Model):
    HOLIDAY_TYPES = (("federal", "Federal"), ("state", "State"))

    country_code = models.CharField(max_length=2)
    date = models.DateField()
    name = models.CharField(max_length=128)
    type = models.CharField(max_length=8, choices=HOLIDAY_TYPES)
    state_code = models.CharField(max_length=8, null=True, blank=True)  # noqa: DJ001

    class Meta:
        unique_together = (("country_code", "date", "name"),)
        indexes: ClassVar = [models.Index(fields=["country_code", "date"])]
        ordering = ("country_code", "date")

    def __str__(self) -> str:
        return f"{self.country_code} {self.date} {self.name}"


class CountryLeaveTypeDefault(models.Model):
    ACCRUAL_TYPES = (
        ("annual", "Annual"),
        ("monthly", "Monthly"),
        ("event_based", "Event-based"),
        ("none", "No accrual"),
    )

    country_code = models.CharField(max_length=2)
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=64)
    default_days = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    statutory = models.BooleanField(default=False)
    accrual_type = models.CharField(max_length=16, choices=ACCRUAL_TYPES)
    # v1.8.0 — copied verbatim into the org's default LeavePolicy.tenure_brackets
    # at seed time. Shape: [{"min_years": int, "days": number}, ...]
    tenure_brackets = models.JSONField(default=list, blank=True)

    class Meta:
        unique_together = (("country_code", "code"),)

    def __str__(self) -> str:
        return f"{self.country_code} {self.code} {self.name}"


class Organization(BaseModel):
    STATUS_CHOICES = (
        ("active", "Active"),
        ("suspended", "Suspended"),
        ("archived", "Archived"),
    )

    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=80, unique=True)
    country_code = models.CharField(max_length=2)
    default_currency = models.CharField(max_length=3)
    default_timezone = models.CharField(max_length=64)
    default_locale = models.CharField(max_length=10)
    settings = models.JSONField(default=dict, blank=True)
    plan_id = models.UUIDField(null=True, blank=True)  # Phase 2 stub
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="active")
    logo_s3_key = models.CharField(max_length=512, blank=True, null=True)  # noqa: DJ001

    def __str__(self) -> str:
        return f"{self.slug} ({self.name})"


class Department(TenantBaseModel):
    name = models.CharField(max_length=200)
    parent = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        related_name="children",
        null=True,
        blank=True,
    )
    # head_employee_id is a UUID without an FK constraint here;
    # the FK to identity.Employee is added in M2 once that model exists.
    head_employee_id = models.UUIDField(null=True, blank=True)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=["org_id", "name", "parent"],
                condition=models.Q(deleted_at__isnull=True),
                name="department_unique_name_per_parent_within_org",
            ),
        ]
        indexes: ClassVar = [
            models.Index(fields=["org_id", "parent"]),
        ]

    def __str__(self) -> str:
        return self.name
