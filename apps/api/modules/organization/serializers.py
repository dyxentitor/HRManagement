from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from modules.employee.services.avatar import presigned_get_url

from .models import Department, Organization
from .validators import validate_default_subdivision


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
            "default_subdivision_code",
            "default_currency",
            "default_timezone",
            "default_locale",
            "settings",
            "status",
            "logo_url",
        )
        read_only_fields = ("id", "slug", "status", "logo_url")

    def validate(self, attrs):
        """Subdivision must belong to the org's own country.

        Validated together rather than in `validate_default_subdivision_code`
        because the check needs the country, which may itself be part of the
        same PATCH.
        """
        attrs = super().validate(attrs)
        if "default_subdivision_code" not in attrs:
            return attrs
        country = attrs.get("country_code", self.instance.country_code if self.instance else "")
        try:
            attrs["default_subdivision_code"] = validate_default_subdivision(
                country_code=country,
                subdivision_code=attrs["default_subdivision_code"],
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                {"default_subdivision_code": list(exc.messages)}
            ) from exc
        return attrs

    def get_logo_url(self, obj: Organization) -> str | None:
        if not obj.logo_s3_key:
            return None
        return presigned_get_url(obj.logo_s3_key, expires_in=3600)


class OrgBrandingSerializer(serializers.ModelSerializer):
    """Just the shell branding — org name + logo. Readable by any authenticated
    user (unlike the full, admin-gated OrgSettingsSerializer)."""

    logo_url = serializers.SerializerMethodField()
    logo_mode = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = ("name", "logo_url", "logo_mode")

    def get_logo_url(self, obj: Organization) -> str | None:
        if not obj.logo_s3_key:
            return None
        return presigned_get_url(obj.logo_s3_key, expires_in=3600)

    def get_logo_mode(self, obj: Organization) -> str:
        mode = (obj.settings or {}).get("logo_mode")
        return "legacy" if mode == "legacy" else "landscape"
