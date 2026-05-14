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
        # v1.9.2 (M1): use the bulk-precomputed map injected by the view via
        # context, instead of firing one query per row (N+1 fix).
        if not obj.email:
            return None
        by_email: dict[str, Employee] | None = self.context.get("unlinked_employees_by_email")
        if by_email is None:
            # Fallback: the legacy single-query path. Used in unit tests that
            # instantiate the serializer outside the view (no context).
            match = Employee.objects.filter(
                org_id=obj.org_id,
                user_id__isnull=True,
                deleted_at__isnull=True,
                email__iexact=obj.email,
            ).first()
        else:
            match = by_email.get(obj.email.lower())
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
        # v1.9.2 (M1): same bulk-precompute pattern as UnlinkedUserSerializer.
        if not obj.email:
            return None
        by_email: dict[str, User] | None = self.context.get("unlinked_users_by_email")
        if by_email is None:
            match = User.objects.filter(
                org_id=obj.org_id,
                email__iexact=obj.email,
                employee_profile__isnull=True,
            ).first()
        else:
            match = by_email.get(obj.email.lower())
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

    def get_serializer_context(self):
        """v1.9.2 (M1): precompute a {lower_email -> Employee} map once per
        request, replacing the per-row email-match query. One extra SELECT
        instead of N."""
        ctx = super().get_serializer_context()
        org_id = self.request.user.org_id
        candidates = Employee.objects.filter(
            org_id=org_id, user_id__isnull=True, deleted_at__isnull=True
        ).exclude(email="")
        ctx["unlinked_employees_by_email"] = {e.email.lower(): e for e in candidates if e.email}
        return ctx


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

    def get_serializer_context(self):
        """v1.9.2 (M1): symmetric to UnlinkedUsersView — bulk-fetch all users
        in this org that lack an employee_profile, keyed by lowercase email."""
        ctx = super().get_serializer_context()
        org_id = self.request.user.org_id
        candidates = User.objects.filter(org_id=org_id, employee_profile__isnull=True).exclude(
            email=""
        )
        ctx["unlinked_users_by_email"] = {u.email.lower(): u for u in candidates if u.email}
        return ctx
