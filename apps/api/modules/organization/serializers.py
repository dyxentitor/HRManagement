from rest_framework import serializers

from modules.employee.services.avatar import presigned_get_url

from .models import Department, Organization


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = (
            "id",
            "name",
            "slug",
            "country_code",
            "default_currency",
            "default_timezone",
            "default_locale",
            "settings",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ("id", "name", "parent", "head_employee_id", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class OrgSettingsSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = (
            "id",
            "name",
            "slug",
            "country_code",
            "default_currency",
            "default_timezone",
            "default_locale",
            "settings",
            "status",
            "logo_url",
        )
        read_only_fields = ("id", "slug", "status", "logo_url")

    def get_logo_url(self, obj: Organization) -> str | None:
        if not obj.logo_s3_key:
            return None
        return presigned_get_url(obj.logo_s3_key, expires_in=3600)
