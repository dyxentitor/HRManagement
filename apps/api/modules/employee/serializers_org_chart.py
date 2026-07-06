"""Lean read-only serializers for the Organization Chart (v1.54.0)."""

from __future__ import annotations

from rest_framework import serializers

from .models import Employee


class OrgNodeSerializer(serializers.ModelSerializer):
    """Compact employee node — kept small so lazy branch loads stay cheap."""

    full_name = serializers.CharField(read_only=True)
    department_id = serializers.PrimaryKeyRelatedField(source="department", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
    manager_name = serializers.SerializerMethodField()
    direct_reports_count = serializers.SerializerMethodField()
    has_reports = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = (
            "id",
            "full_name",
            "email",
            "role_title",
            "department_id",
            "department_name",
            "employment_type",
            "status",
            "photo_url",
            "manager",
            "manager_name",
            "direct_reports_count",
            "has_reports",
        )

    def get_manager_name(self, obj: Employee) -> str | None:
        return obj.manager.full_name if obj.manager_id else None

    def _dr_count(self, obj: Employee) -> int:
        dr = getattr(obj, "_dr", None)
        return dr if dr is not None else obj.direct_reports.count()

    def get_direct_reports_count(self, obj: Employee) -> int:
        return self._dr_count(obj)

    def get_has_reports(self, obj: Employee) -> bool:
        return self._dr_count(obj) > 0

    def get_photo_url(self, obj: Employee) -> str | None:
        if not obj.photo_s3_key:
            return None
        from .services.avatar import presigned_get_url

        return presigned_get_url(obj.photo_s3_key, expires_in=3600)


class OrgSearchHitSerializer(OrgNodeSerializer):
    """Org node plus its root→parent ancestor id path (for search auto-expand)."""

    ancestor_ids = serializers.SerializerMethodField()

    class Meta(OrgNodeSerializer.Meta):
        fields = (*OrgNodeSerializer.Meta.fields, "ancestor_ids")

    def get_ancestor_ids(self, obj: Employee) -> list[str]:
        return list(getattr(obj, "ancestor_ids", []))
