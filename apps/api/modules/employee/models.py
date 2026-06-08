"""Employee model — Tier 2 fields per spec §3."""

from __future__ import annotations

from typing import ClassVar

from django.core.exceptions import ValidationError
from django.db import models

from common.fields import EncryptedCharField
from common.models import TenantBaseModel

GENDER_CHOICES = (
    ("male", "Male"),
    ("female", "Female"),
    ("other", "Other"),
    ("undisclosed", "Undisclosed"),
)
MARITAL_CHOICES = (
    ("single", "Single"),
    ("married", "Married"),
    ("divorced", "Divorced"),
    ("widowed", "Widowed"),
)
EMPLOYMENT_TYPE_CHOICES = (
    ("fulltime", "Full-time"),
    ("parttime", "Part-time"),
    ("contract", "Contract"),
    ("intern", "Intern"),
)
SCHEDULE_TYPE_CHOICES = (
    ("fixed", "Fixed"),
    ("shift", "Shift"),
)
STATUS_CHOICES = (
    ("active", "Active"),
    ("probation", "Probation"),
    ("on_leave", "On leave"),
    ("terminated", "Terminated"),
    ("resigned", "Resigned"),
)


class Employee(TenantBaseModel):
    user = models.OneToOneField(
        "identity.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee_profile",
    )
    employee_code = models.CharField(max_length=32)

    # Core
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    preferred_name = models.CharField(max_length=100, blank=True)
    email = models.EmailField()
    phone = models.CharField(max_length=32, null=True, blank=True)
    alt_phone = models.CharField(max_length=32, blank=True)

    # Personal (encrypted IC; last 4 plaintext for display)
    ic_number = EncryptedCharField(max_length=64, null=True, blank=True)
    ic_last4 = models.CharField(max_length=4, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=16, choices=GENDER_CHOICES, null=True, blank=True)
    nationality = models.CharField(max_length=2, null=True, blank=True)
    marital_status = models.CharField(max_length=16, choices=MARITAL_CHOICES, null=True, blank=True)
    religion = models.CharField(max_length=32, blank=True)

    # Address
    address_line1 = models.CharField(max_length=200, null=True, blank=True)
    address_line2 = models.CharField(max_length=200, null=True, blank=True)
    city = models.CharField(max_length=100, null=True, blank=True)
    state = models.CharField(max_length=100, null=True, blank=True)
    postcode = models.CharField(max_length=20, null=True, blank=True)
    country_code = models.CharField(max_length=2, null=True, blank=True)

    # Employment
    department = models.ForeignKey(
        "organization.Department",
        on_delete=models.PROTECT,
        related_name="employees",
    )
    manager = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="direct_reports",
    )
    team = models.ForeignKey(
        "Team",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="members",
    )
    role_title = models.CharField(max_length=100, null=True, blank=True)
    employment_type = models.CharField(max_length=16, choices=EMPLOYMENT_TYPE_CHOICES)
    schedule_type = models.CharField(max_length=8, choices=SCHEDULE_TYPE_CHOICES, default="fixed")
    hire_date = models.DateField()
    probation_end_date = models.DateField(null=True, blank=True)
    contract_end_date = models.DateField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)

    # Bank (encrypted)
    bank_name = models.CharField(max_length=100, null=True, blank=True)
    bank_account_number = EncryptedCharField(max_length=64, null=True, blank=True)
    bank_account_last4 = models.CharField(max_length=4, blank=True)

    # Tax IDs (MY-specific; encrypted)
    lhdn_tax_no = EncryptedCharField(max_length=64, null=True, blank=True)
    epf_no = EncryptedCharField(max_length=64, null=True, blank=True)
    socso_no = EncryptedCharField(max_length=64, null=True, blank=True)
    eis_no = EncryptedCharField(max_length=64, null=True, blank=True)

    # Emergency contact (single)
    emergency_contact_name = models.CharField(max_length=100, null=True, blank=True)
    emergency_contact_relationship = models.CharField(max_length=50, null=True, blank=True)
    emergency_contact_phone = models.CharField(max_length=32, null=True, blank=True)

    # Profile photo (post-resize thumbnail key in MinIO; empty = no photo)
    photo_s3_key = models.CharField(max_length=255, blank=True, default="")

    # Ops
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="active")
    timezone = models.CharField(max_length=64, blank=True)
    locale = models.CharField(max_length=10, blank=True)

    class Meta:
        db_table = "employee_employee"
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=["org_id", "employee_code"],
                condition=models.Q(deleted_at__isnull=True),
                name="employee_unique_code_per_org",
            ),
        ]
        indexes: ClassVar = [
            models.Index(fields=["org_id", "status"]),
            models.Index(fields=["department_id"]),
            models.Index(fields=["manager_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.first_name} {self.last_name} ({self.employee_code})"

    @property
    def full_name(self) -> str:
        """Display name — preferred_name (if set) else first_name, plus last_name."""
        first = self.preferred_name or self.first_name
        return f"{first} {self.last_name}"

    def clean(self) -> None:
        if self.manager_id is not None and self.manager_id == self.id:
            raise ValidationError({"manager": "An employee cannot be their own manager."})

    def save(self, *args, **kwargs) -> None:
        # Enforce no-self-management at save time (clean() isn't called by ORM .save())
        if self.manager_id is not None and self.manager_id == self.id:
            raise ValidationError({"manager": "An employee cannot be their own manager."})
        super().save(*args, **kwargs)


class Team(TenantBaseModel):
    """Org-defined work team (e.g., Team Lead, 24x7 Standby).

    Used for grouping rows in the roster. Optional `min_headcount` drives
    coverage warnings on the schedule grid.
    """

    name = models.CharField(max_length=64)
    parent_team = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
    )
    sort_order = models.IntegerField(default=0)
    min_headcount = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "employee_team"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["org_id", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="team_unique_name_per_org",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["org_id", "sort_order"]),
        ]

    def __str__(self) -> str:
        return self.name
