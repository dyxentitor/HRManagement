"""Serializers for payslip + payroll module."""

from __future__ import annotations

from rest_framework import serializers

from .models import (
    PayrollComponent,
    PayrollException,
    PayrollPeriod,
    PayrollRun,
    PayslipRecord,
)


class PayrollPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollPeriod
        fields = (
            "id",
            "period_start",
            "period_end",
            "period_type",
            "pay_date",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class PayrollComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollComponent
        fields = ("id", "code", "name", "type", "is_statutory", "created_at")
        read_only_fields = ("id", "created_at")


class PayslipRecordSerializer(serializers.ModelSerializer):
    pdf_url = serializers.SerializerMethodField()
    # Surface the period's dates so the employee's payslip view can label the
    # month + pay date without hitting the HR-only payroll-periods endpoint.
    period_start = serializers.DateField(source="period.period_start", read_only=True)
    period_end = serializers.DateField(source="period.period_end", read_only=True)
    pay_date = serializers.DateField(source="period.pay_date", read_only=True)

    class Meta:
        model = PayslipRecord
        fields = (
            "id",
            "employee_id",
            "period",
            "period_start",
            "period_end",
            "pay_date",
            "gross",
            "net",
            "currency_code",
            "components",
            "deductions",
            "pdf_s3_key",
            "pdf_url",
            "pdf_generated_at",
            "status",
            "published_at",
            "source",
            "created_at",
        )
        read_only_fields = fields

    def get_pdf_url(self, obj: PayslipRecord) -> str | None:
        """Return a presigned S3 GET URL for the PDF (valid 1 hour)."""
        if not obj.pdf_s3_key:
            return None
        from common.storage.s3 import bucket, public_s3_client

        try:
            return public_s3_client().generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket(), "Key": obj.pdf_s3_key},
                ExpiresIn=3600,
            )
        except Exception:
            return None


class PayrollRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollRun
        fields = (
            "id",
            "period",
            "uploaded_by",
            "status",
            "row_count",
            "errors",
            "csv_s3_key",
            "published_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class PayrollRunCreateSerializer(serializers.Serializer):
    period = serializers.PrimaryKeyRelatedField(queryset=PayrollPeriod.objects.none())

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request:
            self.fields["period"].queryset = PayrollPeriod.all_objects.filter(
                org_id=request.user.org_id,
                deleted_at__isnull=True,
            )


class PayrollExceptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollException
        fields = (
            "id",
            "period",
            "employee_id",
            "kind",
            "message",
            "status",
            "resolved_by",
            "resolved_at",
            "created_at",
        )
        read_only_fields = ("id", "status", "resolved_by", "resolved_at", "created_at")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request:
            self.fields["period"].queryset = PayrollPeriod.all_objects.filter(
                org_id=request.user.org_id,
                deleted_at__isnull=True,
            )
