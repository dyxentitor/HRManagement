from __future__ import annotations

from rest_framework import serializers

from .models import Claim, Customer, EmployeeBond, Project


class CustomerSerializer(serializers.ModelSerializer):
    mandays_total = serializers.ReadOnlyField()
    mandays_remaining = serializers.ReadOnlyField()

    class Meta:
        model = Customer
        fields = (
            "id",
            "name",
            "is_active",
            "notes",
            "mandays_total",
            "mandays_remaining",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def validate_name(self, value):
        request = self.context.get("request")
        qs = Customer.objects.filter(
            org_id=request.user.org_id,
            is_active=True,
            name__iexact=value.strip(),
        )
        if self.instance is not None:
            qs = qs.exclude(id=self.instance.id)
        if qs.exists():
            raise serializers.ValidationError(f"A customer named '{value.strip()}' already exists.")
        return value.strip()


class ProjectSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    mandays_approved = serializers.ReadOnlyField()
    mandays_remaining = serializers.ReadOnlyField()

    class Meta:
        model = Project
        fields = (
            "id",
            "customer",
            "customer_name",
            "name",
            "description",
            "budget_mandays",
            "manager_id",
            "include_soc",
            "status",
            "deadline",
            "mandays_approved",
            "mandays_remaining",
            "created_at",
        )
        read_only_fields = ("id", "created_at", "manager_id")

    def validate(self, attrs):
        if self.instance is not None:
            # customer is immutable after creation — silently drop any attempt to change it
            attrs.pop("customer", None)

            # budget cannot be lowered below what has already been consumed
            if "budget_mandays" in attrs:
                from .services.ledger import project_consumed

                consumed = project_consumed(self.instance.id)
                if attrs["budget_mandays"] < consumed:
                    raise serializers.ValidationError(
                        {
                            "budget_mandays": (
                                f"Budget cannot be below the {consumed} mandays already consumed."
                            )
                        }
                    )
        return attrs


class ClaimSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="project.name", read_only=True)

    class Meta:
        model = Claim
        fields = (
            "id",
            "project",
            "project_name",
            "employee_id",
            "mandays",
            "note",
            "status",
            "reviewed_by",
            "reviewed_at",
            "reject_reason",
            "billing_quarter",
            "payout_status",
            "created_at",
        )
        read_only_fields = (
            "id",
            "employee_id",
            "status",
            "reviewed_by",
            "reviewed_at",
            "reject_reason",
            "billing_quarter",
            "payout_status",
            "created_at",
        )


class BondSerializer(serializers.ModelSerializer):
    is_active = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeBond
        fields = (
            "id",
            "employee_id",
            "accepted_at",
            "period_start",
            "period_end",
            "terms_version",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "accepted_at", "created_at")

    def get_is_active(self, obj) -> bool:
        return obj.is_active()
