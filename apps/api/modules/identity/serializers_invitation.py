"""Serializers for the onboarding invitation endpoints."""

from __future__ import annotations

from rest_framework import serializers

from modules.employee.models import Employee

from .models import Invitation


def _emp_for_user(user_id):
    return (
        Employee.all_objects.filter(user_id=user_id, deleted_at__isnull=True)
        .select_related("department")
        .first()
    )


class InvitationSerializer(serializers.ModelSerializer):
    """HR-facing read of an invitation, with the linked employee name + dept."""

    email = serializers.CharField(source="user.email", read_only=True)
    effective_status = serializers.CharField(read_only=True)
    employee_name = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()

    class Meta:
        model = Invitation
        fields = (
            "id",
            "user_id",
            "employee_id",
            "email",
            "sent_to_email",
            "status",
            "effective_status",
            "expires_at",
            "sent_at",
            "opened_at",
            "activated_at",
            "revoked_at",
            "sent_count",
            "created_at",
            "employee_name",
            "department",
        )
        read_only_fields = fields

    def _emp(self, obj):
        if not hasattr(obj, "_cached_emp"):
            obj._cached_emp = _emp_for_user(obj.user_id)
        return obj._cached_emp

    def get_employee_name(self, obj) -> str:
        emp = self._emp(obj)
        return emp.full_name if emp else obj.user.email

    def get_department(self, obj) -> str | None:
        emp = self._emp(obj)
        return emp.department.name if emp and emp.department_id else None


class InvitationActivateSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(min_length=8, write_only=True)


class InvitationExtendSerializer(serializers.Serializer):
    hours = serializers.IntegerField(default=48, min_value=1, max_value=168)
