"""Leave module serializers."""

from rest_framework import serializers

from .models import LeaveApproval, LeaveBalance, LeaveRequest, LeaveType


class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = (
            "id",
            "code",
            "name",
            "accrual_type",
            "default_days",
            "is_paid",
            "requires_attachment",
            "max_consecutive_days",
            "min_advance_notice_days",
            "is_statutory",
            "gender_restriction",
        )


class LeaveBalanceSerializer(serializers.ModelSerializer):
    leave_type_code = serializers.CharField(source="leave_type.code", read_only=True)
    available = serializers.DecimalField(max_digits=6, decimal_places=2, read_only=True)

    class Meta:
        model = LeaveBalance
        fields = (
            "id",
            "employee_id",
            "leave_type",
            "leave_type_code",
            "year",
            "entitled",
            "accrued",
            "taken",
            "pending",
            "carried_forward",
            "available",
        )
        read_only_fields = fields


class LeaveApprovalSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveApproval
        fields = ("id", "level", "approver_id", "status", "comment", "acted_at", "delegated_to")


class LeaveRequestSerializer(serializers.ModelSerializer):
    approvals = LeaveApprovalSerializer(many=True, read_only=True)
    leave_type_code = serializers.CharField(source="leave_type.code", read_only=True)

    class Meta:
        model = LeaveRequest
        fields = (
            "id",
            "org_id",
            "employee_id",
            "leave_type",
            "leave_type_code",
            "start_date",
            "end_date",
            "total_days",
            "is_half_day",
            "half_day_period",
            "reason",
            "attachment_url",
            "status",
            "current_level",
            "submitted_at",
            "decided_at",
            "decided_by",
            "approvals",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "org_id",
            "employee_id",
            "status",
            "current_level",
            "submitted_at",
            "decided_at",
            "decided_by",
            "approvals",
            "created_at",
            "updated_at",
        )


class LeaveActionSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True, default="")
