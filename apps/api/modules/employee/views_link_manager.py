"""Admin views for the v1.9.0 User↔Employee Link Manager."""

from __future__ import annotations

from typing import ClassVar

from rest_framework import serializers
from rest_framework.generics import ListAPIView

from modules.employee.models import Employee
from modules.identity.models import User
from modules.identity.permissions import HRMSPermission


class _SuggestedEmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = ("id", "first_name", "last_name", "employee_code", "email")


class _SuggestedUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email")


class UnlinkedUserSerializer(serializers.ModelSerializer):
    role_codes = serializers.SerializerMethodField()
    suggested_employee = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "email", "role_codes", "created_at", "suggested_employee")

    def get_role_codes(self, obj: User) -> list[str]:
        return list(obj.user_roles.values_list("role__code", flat=True))

    def get_suggested_employee(self, obj: User) -> dict | None:
        if not obj.email:
            return None
        match = Employee.objects.filter(
            org_id=obj.org_id,
            user_id__isnull=True,
            deleted_at__isnull=True,
            email__iexact=obj.email,
        ).first()
        return _SuggestedEmployeeSerializer(match).data if match else None


class UnlinkedEmployeeSerializer(serializers.ModelSerializer):
    suggested_user = serializers.SerializerMethodField()
    department_name = serializers.CharField(
        source="department.name", read_only=True, allow_null=True
    )

    class Meta:
        model = Employee
        fields = (
            "id",
            "first_name",
            "last_name",
            "employee_code",
            "email",
            "department_name",
            "suggested_user",
        )

    def get_suggested_user(self, obj: Employee) -> dict | None:
        if not obj.email:
            return None
        match = User.objects.filter(
            org_id=obj.org_id,
            email__iexact=obj.email,
            employee_profile__isnull=True,
        ).first()
        return _SuggestedUserSerializer(match).data if match else None


class UnlinkedUsersView(ListAPIView):
    """GET /api/v1/admin/unlinked-users/ — users in this org with no Employee."""

    serializer_class = UnlinkedUserSerializer
    permission_classes: ClassVar = [HRMSPermission]
    required_perms: ClassVar = ["employee:write:org"]

    def get_queryset(self):
        return User.objects.filter(
            org_id=self.request.user.org_id, employee_profile__isnull=True
        ).order_by("email")


class UnlinkedEmployeesView(ListAPIView):
    """GET /api/v1/admin/unlinked-employees/ — employees in this org with no User."""

    serializer_class = UnlinkedEmployeeSerializer
    permission_classes: ClassVar = [HRMSPermission]
    required_perms: ClassVar = ["employee:write:org"]

    def get_queryset(self):
        return Employee.objects.filter(
            org_id=self.request.user.org_id,
            user_id__isnull=True,
            deleted_at__isnull=True,
        ).order_by("first_name", "last_name")
