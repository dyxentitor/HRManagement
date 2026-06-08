"""Serializers for the identity module."""

from __future__ import annotations

from typing import ClassVar

from rest_framework import serializers

from .models import Role, User, UserRole


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class UserCreateSerializer(serializers.Serializer):
    """User-first create payload (v1.11.0 Task 7).

    The optional `employee` dict is validated by EmployeeSerializer inside the
    view (atomically), not here.
    """

    email = serializers.EmailField()
    role_code = serializers.CharField()
    credential_method = serializers.ChoiceField(choices=["invite", "temp"])
    temp_password = serializers.CharField(required=False, allow_blank=True, write_only=True)
    employee = serializers.DictField(required=False)


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
    new_password = serializers.CharField(write_only=True, min_length=8)


class PasswordChangeSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, min_length=8)


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


class AssignRolesInputSerializer(serializers.Serializer):
    """Body for PATCH /users/{id}/roles/."""

    role_codes = serializers.ListField(child=serializers.CharField(), allow_empty=True)
