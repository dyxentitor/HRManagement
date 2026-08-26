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
    """Global holiday reference. Multi-source, precedence-ranked.

    Rows from different sources may describe the same day; `SOURCE_PRECEDENCE`
    decides which one an org actually inherits. Nothing here is org-scoped —
    tenant-owned holidays live in `schedule.Holiday`.
    """

    HOLIDAY_TYPES = (("federal", "Federal"), ("state", "State"))

    SOURCE_OFFICIAL = "official"
    SOURCE_PROVIDER = "provider"
    SOURCE_LEGACY = "legacy"
    SOURCES = (
        (SOURCE_OFFICIAL, "Verified official government source"),
        (SOURCE_PROVIDER, "Imported provider data"),
        (SOURCE_LEGACY, "Legacy fixture fallback"),
    )
    # Higher wins. Org-level overrides outrank all of these and are resolved
    # in schedule.Holiday, not here.
    SOURCE_PRECEDENCE: ClassVar[dict[str, int]] = {
        SOURCE_OFFICIAL: 30,
        SOURCE_PROVIDER: 20,
        SOURCE_LEGACY: 10,
    }

    country_code = models.CharField(max_length=2)
    date = models.DateField()
    name = models.CharField(max_length=128)
    type = models.CharField(max_length=8, choices=HOLIDAY_TYPES)
    state_code = models.CharField(max_length=8, null=True, blank=True)  # noqa: DJ001

    # --- provenance (v1.84.0) -------------------------------------------
    # Internal CANONICAL identity (common/holidays/canonical.py). Date-, name-
    # and provider-independent: a holiday that moves, gets renamed, or arrives
    # from a different provider updates THIS row instead of inserting another.
    source_key = models.CharField(max_length=200, blank=True, db_index=True)
    # The upstream provider's own identity, verbatim, for audit only.
    external_id = models.CharField(max_length=200, blank=True)
    # Which day of a multi-day festival this is (1-based).
    occurrence = models.PositiveSmallIntegerField(default=1)
    # Full ISO 3166-2 (e.g. "MY-10"). `state_code` is retained for the legacy
    # fixture rows that predate ISO normalization.
    subdivision_code = models.CharField(max_length=16, blank=True)
    source = models.CharField(max_length=16, choices=SOURCES, default=SOURCE_LEGACY)
    source_provider = models.CharField(max_length=64, blank=True)
    source_version = models.CharField(max_length=32, blank=True)
    retrieved_at = models.DateTimeField(null=True, blank=True)
    observed = models.BooleanField(default=False)
    provisional = models.BooleanField(default=False)
    # Set when a later import no longer returns a previously-imported row.
    # We withdraw rather than delete so history stays auditable.
    withdrawn_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        # Scoped by `source` so an official correction and a provider import
        # can describe the same day and be precedence-ranked, and by
        # `subdivision_code` because one holiday legitimately falls on the same
        # date in many states (Deepavali is 15 separate state rows). Identity
        # proper is `(source_key, source)` below; this is a coarse backstop.
        unique_together = (("country_code", "date", "name", "source", "subdivision_code"),)
        constraints: ClassVar[list] = [
            # One row per (identity, tier). An official correction and a
            # provider import for the same holiday coexist and are ranked by
            # SOURCE_PRECEDENCE rather than fighting over a single row.
            models.UniqueConstraint(
                fields=["source_key", "source"],
                condition=models.Q(withdrawn_at__isnull=True) & ~models.Q(source_key=""),
                name="country_holiday_unique_source_key_per_source",
            ),
        ]
        indexes: ClassVar = [
            models.Index(fields=["country_code", "date"]),
            models.Index(fields=["country_code", "subdivision_code", "date"]),
        ]
        ordering = ("country_code", "date")

    def __str__(self) -> str:
        return f"{self.country_code} {self.date} {self.name}"

    @property
    def precedence(self) -> int:
        return self.SOURCE_PRECEDENCE.get(self.source, 0)


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
    # The org's default holiday calendar: country_code + this. Full ISO 3166-2
    # (e.g. "MY-10"); blank means national-only. When a work-location model
    # lands, a location may select its own pair and employees inherit it —
    # this field stays the fallback for employees with no location.
    default_subdivision_code = models.CharField(max_length=16, blank=True)
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
