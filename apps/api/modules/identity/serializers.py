"""Serializers for the identity module."""

from __future__ import annotations

from rest_framework import serializers

from .models import User, UserRole


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class LoginResponseSerializer(serializers.Serializer):
    access_token = serializers.CharField()
    refresh_token = serializers.CharField()
    mfa_required = serializers.BooleanField(default=False)
    mfa_token = serializers.CharField(required=False, allow_blank=True, default="")


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


class MFAConfirmSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=8)


class LoginMFASerializer(serializers.Serializer):
    mfa_token = serializers.CharField()
    code = serializers.CharField(max_length=8)
