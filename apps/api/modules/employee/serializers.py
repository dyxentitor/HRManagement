"""Serializers for Employee — full (HR) and self-edit (whitelist)."""

from __future__ import annotations

from typing import ClassVar

from rest_framework import serializers

from .models import Employee, Team

# Fields that an employee may edit on their own record. Anything outside this
# list requires `employee:write:org` (HR).
SELF_EDIT_WHITELIST = frozenset(
    {
        "phone",
        "alt_phone",
        "address_line1",
        "address_line2",
        "city",
        "state",
        "postcode",
        "country_code",
        "emergency_contact_name",
        "emergency_contact_relationship",
        "emergency_contact_phone",
        "preferred_name",
        "bank_name",
        "bank_account_number",  # bank-change still requires re-MFA — enforced in M2b
    }
)


class EmployeeSerializer(serializers.ModelSerializer):
    """Full HR view — all fields readable; encrypted fields write-through."""

    full_name = serializers.CharField(read_only=True)
    photo_url = serializers.SerializerMethodField()
    profile_completeness = serializers.SerializerMethodField()

    def get_photo_url(self, obj: Employee) -> str | None:
        if not obj.photo_s3_key:
            return None
        from .services.avatar import presigned_get_url

        return presigned_get_url(obj.photo_s3_key, expires_in=3600)

    def get_profile_completeness(self, obj: Employee) -> dict:
        from .services.completeness import profile_completeness

        return profile_completeness(obj)

    def validate_employee_code(self, value: str) -> str:
        """Reject a duplicate code with a clear, field-level message.

        The DB has a ``(org_id, employee_code)`` unique constraint, but
        ``org_id`` is server-set (read-only here) so DRF can't auto-build a
        UniqueTogetherValidator. Without this check a duplicate would surface
        as a DB IntegrityError → HTTP 500 instead of a 400 the form can show.
        ``Employee.objects`` is tenant-scoped (current org) and excludes
        soft-deleted rows, so this is naturally org-local.
        """
        qs = Employee.objects.filter(employee_code=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"An employee with code '{value}' already exists.")
        return value

    class Meta:
        model = Employee
        fields = (
            "id",
            "org_id",
            "user",
            "employee_code",
            "first_name",
            "last_name",
            "preferred_name",
            "full_name",
            "email",
            "phone",
            "alt_phone",
            "ic_number",
            "ic_last4",
            "date_of_birth",
            "gender",
            "nationality",
            "marital_status",
            "religion",
            "address_line1",
            "address_line2",
            "city",
            "state",
            "postcode",
            "country_code",
            "department",
            "manager",
            "role_title",
            "employment_type",
            "schedule_type",
            "hire_date",
            "probation_end_date",
            "contract_end_date",
            "confirmed_at",
            "bank_name",
            "bank_account_number",
            "bank_account_last4",
            "lhdn_tax_no",
            "epf_no",
            "socso_no",
            "eis_no",
            "emergency_contact_name",
            "emergency_contact_relationship",
            "emergency_contact_phone",
            "status",
            "timezone",
            "locale",
            "photo_url",
            "profile_completeness",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "org_id",
            "ic_last4",
            "bank_account_last4",
            "photo_url",
            "profile_completeness",
            "created_at",
            "updated_at",
        )
        extra_kwargs: ClassVar = {
            "ic_number": {"write_only": True},
            "bank_account_number": {"write_only": True},
            "lhdn_tax_no": {"write_only": True},
            "epf_no": {"write_only": True},
            "socso_no": {"write_only": True},
            "eis_no": {"write_only": True},
        }


class EmployeeMeSerializer(EmployeeSerializer):
    """Self-edit serializer — limits writable fields to SELF_EDIT_WHITELIST."""

    def get_extra_kwargs(self) -> dict:
        extra = super().get_extra_kwargs()
        for fname in self.Meta.fields:
            if fname in SELF_EDIT_WHITELIST or fname in self.Meta.read_only_fields:
                continue
            field_kwargs = extra.setdefault(fname, {})
            field_kwargs["read_only"] = True
            # DRF forbids read_only + write_only on the same field.
            field_kwargs.pop("write_only", None)
        return extra


class TeamSerializer(serializers.ModelSerializer):
    """Team CRUD serializer — org_id assigned server-side from request user."""

    class Meta:
        model = Team
        fields = ("id", "name", "parent_team", "sort_order", "min_headcount")
        read_only_fields = ("id",)


class EmployeeAssignmentSerializer(serializers.ModelSerializer):
    """Narrow serializer used by the `employee:assign:team` PATCH lane.

    Only the `team` FK is writable. The PATCH path enforces that the
    request body contains no other keys before delegating to this
    serializer.
    """

    class Meta:
        model = Employee
        fields = ("id", "team")
        read_only_fields = ("id",)
