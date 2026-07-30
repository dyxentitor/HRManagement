"""Serializers for the identity module."""

from __future__ import annotations

from typing import ClassVar

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Role, User, UserRole


def validate_password_strength(value: str) -> str:
    """Run Django's AUTH_PASSWORD_VALIDATORS, re-raising as a DRF error.

    Django's ``User.set_password`` does not invoke the configured validators;
    every serializer that accepts a user-chosen password must call this so the
    policy is actually enforced.
    """
    try:
        validate_password(value)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages)) from exc
    return value


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class _LeaveGrantItemSerializer(serializers.Serializer):
    leave_type_id = serializers.UUIDField()
    days_per_year = serializers.DecimalField(max_digits=6, decimal_places=2)
    permanent = serializers.BooleanField(default=False)


class _LeaveGrantSerializer(serializers.Serializer):
    enabled = serializers.BooleanField(default=False)
    items = _LeaveGrantItemSerializer(many=True, required=False, default=list)


class UserCreateSerializer(serializers.Serializer):
    """User-first create payload (v1.11.0 Task 7).

    The optional `employee` dict is validated by EmployeeSerializer inside the
    view (atomically), not here.

    The optional `leave_grant` block, when `enabled`, seeds LeaveBalance rows
    for the newly created employee in the same atomic transaction (Task 4).
    """

    email = serializers.EmailField()
    role_code = serializers.CharField()
    credential_method = serializers.ChoiceField(choices=["invite", "temp"])
    temp_password = serializers.CharField(required=False, allow_blank=True, write_only=True)
    # Where the invite is delivered (personal email). Falls back to the company
    # `email` when blank. The login always stays `email`.
    invite_email = serializers.EmailField(required=False, allow_blank=True)
    employee = serializers.DictField(required=False)
    leave_grant = _LeaveGrantSerializer(required=False)


class LoginResponseSerializer(serializers.Serializer):
    access_token = serializers.CharField()
    refresh_token = serializers.CharField()
    mfa_required = serializers.BooleanField(default=False)
    mfa_token = serializers.CharField(required=False, allow_blank=True, default="")
    must_change_password = serializers.BooleanField(default=False)


class RefreshSerializer(serializers.Serializer):
    refresh_token = serializers.CharField()


class LogoutSerializer(serializers.Serializer):
    refresh_token = serializers.CharField()


class MeSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()
    role_codes = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "org_id",
            "email",
            "status",
            "mfa_enabled",
            "must_change_password",
            "preferences",
            "permissions",
            "role_codes",
        )

    def get_permissions(self, obj: User) -> list[str]:
        return list(obj.user_roles.values_list("role__permissions__code", flat=True).distinct())

    def get_role_codes(self, obj: User) -> list[str]:
        return list(UserRole.objects.filter(user=obj).values_list("role__code", flat=True))


class PasswordForgotSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=10)

    def validate_new_password(self, value: str) -> str:
        return validate_password_strength(value)


class PasswordChangeSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, min_length=10)

    def validate_new_password(self, value: str) -> str:
        return validate_password_strength(value)


class MFAConfirmSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=8)


class LoginMFASerializer(serializers.Serializer):
    mfa_token = serializers.CharField()
    code = serializers.CharField(max_length=8)


# --- Admin: roles + assignment ---------------------------------------------


class RoleListItemSerializer(serializers.ModelSerializer):
    """Used for the list endpoint."""

    permission_count = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()

    class Meta:
        model: ClassVar = Role
        fields: ClassVar = [
            "id",
            "code",
            "name",
            "description",
            "is_system",
            "permission_count",
            "user_count",
        ]

    def get_permission_count(self, obj):
        return obj.role_permissions.count()

    def get_user_count(self, obj):
        return UserRole.objects.filter(role=obj).count()


class RoleDetailSerializer(serializers.ModelSerializer):
    """Used for retrieve. Includes full permission_codes[]."""

    permission_codes = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()

    class Meta:
        model: ClassVar = Role
        fields: ClassVar = [
            "id",
            "code",
            "name",
            "description",
            "is_system",
            "permission_codes",
            "user_count",
            "updated_at",
        ]

    def get_permission_codes(self, obj):
        return list(
            obj.role_permissions.values_list("permission__code", flat=True).order_by(
                "permission__code",
            ),
        )

    def get_user_count(self, obj):
        return UserRole.objects.filter(role=obj).count()


class RolePermissionsInputSerializer(serializers.Serializer):
    """Body for PATCH /roles/{code}/permissions/."""

    permission_codes = serializers.ListField(child=serializers.CharField(), allow_empty=True)
    base_updated_at = serializers.DateTimeField(required=False, allow_null=True)


class RoleCreateInputSerializer(serializers.Serializer):
    """Body for POST /roles/."""

    name = serializers.CharField(max_length=128)
    description = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )


class RoleRenameInputSerializer(serializers.Serializer):
    """Body for PATCH /roles/{code}/."""

    name = serializers.CharField(max_length=128, required=False)
    description = serializers.CharField(max_length=255, required=False, allow_blank=True)


class RoleCloneInputSerializer(serializers.Serializer):
    """Body for POST /roles/{code}/clone/."""

    name = serializers.CharField(max_length=128)
    description = serializers.CharField(max_length=255, required=False, allow_blank=True)


class AssignRolesInputSerializer(serializers.Serializer):
    """Body for PATCH /users/{id}/roles/."""

    role_codes = serializers.ListField(child=serializers.CharField(), allow_empty=True)


class UserAccountSerializer(serializers.ModelSerializer):
    """Read-only account row for the Accounts management table."""

    role_codes = serializers.SerializerMethodField()
    employee = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "status",
            "is_active",
            "mfa_enabled",
            "last_login_at",
            "role_codes",
            "employee",
        )

    def get_role_codes(self, obj: User) -> list[str]:
        return [r.code for r in obj.roles]

    def get_employee(self, obj: User) -> dict | None:
        emp = getattr(obj, "employee_profile", None)
        if emp is None:
            return None
        return {
            "id": str(emp.id),
            "full_name": emp.full_name,
            "employee_code": emp.employee_code,
        }
