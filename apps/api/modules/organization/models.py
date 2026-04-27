"""Organization + country reference models."""

from __future__ import annotations

from typing import ClassVar

from django.db import models

from common.models import BaseModel


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

    def __str__(self) -> str:
        return f"{self.slug} ({self.name})"
