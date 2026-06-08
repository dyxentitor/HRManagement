"""Leave module serializers."""

from decimal import Decimal

from rest_framework import serializers

from .models import (
    EmployeeLeaveOverride,
    LeaveApproval,
    LeaveBalance,
    LeaveBalanceLedger,
    LeavePolicy,
    LeaveRequest,
    LeaveType,
)


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
            "carry_forward_max",
            "is_statutory",
            "gender_restriction",
            # v1.8.0 additions
            "carry_forward_expiry_months",
            "requires_service_months",
            "notice_days_required",
            "max_per_lifetime_events",
        )


class LeavePolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = LeavePolicy
        fields = (
            "id",
            "leave_type",
            "applies_to_role_id",
            "applies_to_department_id",
            "days_per_year",
            "tenure_brackets",
            "effective_from",
            "effective_to",
        )

    def validate_tenure_brackets(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("tenure_brackets must be a list.")
        prev_min = -1
        prev_days = -1.0
        for entry in value:
            if not isinstance(entry, dict) or "min_years" not in entry or "days" not in entry:
                raise serializers.ValidationError(
                    "Each entry must be {min_years: int, days: number}."
                )
            if entry["min_years"] <= prev_min:
                raise serializers.ValidationError("min_years must be strictly ascending.")
            if float(entry["days"]) < prev_days:
                raise serializers.ValidationError("days must be non-decreasing across tiers.")
            prev_min = entry["min_years"]
            prev_days = float(entry["days"])
        return value


class EmployeeLeaveOverrideSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeLeaveOverride
        fields = (
            "id",
            "employee_id",
            "leave_type",
            "days_override",
            "effective_from",
            "effective_to",
            "note",
            "created_by",
            "created_at",
        )
        read_only_fields = ("created_by", "created_at", "employee_id")


class LeaveBalanceSerializer(serializers.ModelSerializer):
    leave_type_code = serializers.CharField(source="leave_type.code", read_only=True)
    leave_type_name = serializers.CharField(source="leave_type.name", read_only=True)
    available = serializers.DecimalField(max_digits=6, decimal_places=2, read_only=True)
    ledger_recent = serializers.SerializerMethodField()

    class Meta:
        model = LeaveBalance
        fields = (
            "id",
            "employee_id",
            "leave_type",
            "leave_type_code",
            "leave_type_name",
            "year",
            "entitled",
            "accrued",
            "taken",
            "pending",
            "carried_forward",
            "carried_forward_expires_at",
            "available",
            "ledger_recent",
        )
        read_only_fields = fields

    def get_ledger_recent(self, obj) -> list[dict]:
        rows = LeaveBalanceLedger.objects.filter(
            employee_id=obj.employee_id,
            leave_type=obj.leave_type,
        ).order_by("-ts")[:10]
        return [
            {
                "ts": r.ts.isoformat(),
                "delta": str(r.delta),
                "reason": r.reason,
                "reference_type": r.reference_type,
            }
            for r in rows
        ]


class LeaveApprovalSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveApproval
        fields = (
            "id",
            "level",
            "approver_id",
            "status",
            "comment",
            "acted_at",
            "delegated_to",
        )


class LeaveRequestSerializer(serializers.ModelSerializer):
    approvals = LeaveApprovalSerializer(many=True, read_only=True)
    leave_type_code = serializers.CharField(source="leave_type.code", read_only=True)

    def validate(self, attrs):
        """Enforce half-day rules and compute total_days server-side.

        A half-day is exactly one date (start == end) + a period (am/pm) = 0.5
        days. Full-day requests span inclusive calendar days. total_days is
        always derived here, so a stale/wrong client value can't corrupt
        balances.
        """
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        is_half = attrs.get("is_half_day", getattr(self.instance, "is_half_day", False))
        period = attrs.get("half_day_period", getattr(self.instance, "half_day_period", ""))
        if start is None or end is None:
            return attrs
        if is_half:
            if start != end:
                raise serializers.ValidationError({"end_date": "Half day must be a single date."})
            if period not in ("am", "pm"):
                raise serializers.ValidationError(
                    {"half_day_period": "Choose Morning (AM) or Afternoon (PM)."}
                )
            attrs["total_days"] = Decimal("0.5")
        else:
            if end < start:
                raise serializers.ValidationError(
                    {"end_date": "End date must be on or after the start date."}
                )
            attrs["half_day_period"] = ""
            attrs["total_days"] = Decimal((end - start).days + 1)
        return attrs

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
