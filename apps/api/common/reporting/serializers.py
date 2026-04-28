"""Reporting serializers."""

from __future__ import annotations

from typing import ClassVar

from rest_framework import serializers

from .models import ReportExportJob, SavedView


class SavedViewSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedView
        fields: ClassVar[list] = ["id", "report_code", "name", "filters", "created_at"]
        read_only_fields: ClassVar[list] = ["id", "created_at"]


class ReportExportJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportExportJob
        fields: ClassVar[list] = [
            "id",
            "report_code",
            "format",
            "status",
            "s3_key",
            "error",
            "created_at",
            "completed_at",
        ]
        read_only_fields: ClassVar[list] = [
            "id",
            "status",
            "s3_key",
            "error",
            "created_at",
            "completed_at",
        ]
