"""Serializers for the claims module."""

from rest_framework import serializers

from .models import (
    ClaimApproval,
    ClaimAttachment,
    ClaimCategory,
    ClaimPolicy,
    ClaimRequest,
)


class ClaimCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ClaimCategory
        fields = (
            "id",
            "code",
            "name",
            "requires_attachment",
            "max_amount_per_claim",
            "currency_code",
        )
        read_only_fields = ("id",)


class ClaimPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = ClaimPolicy
        fields = (
            "id",
            "category",
            "role_id",
            "dept_id",
            "annual_limit",
            "monthly_limit",
            "approval_chain_code",
        )
        read_only_fields = ("id",)


class ClaimAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClaimAttachment
        fields = (
            "id",
            "filename",
            "content_type",
            "size_bytes",
            "s3_key",
            "uploaded_by",
            "uploaded_at",
        )
        read_only_fields = ("id", "uploaded_by", "uploaded_at")


class ClaimApprovalSerializer(serializers.ModelSerializer):
    approver_name = serializers.SerializerMethodField()

    class Meta:
        model = ClaimApproval
        fields = (
            "id",
            "level",
            "approver_id",
            "approver_name",
            "status",
            "comment",
            "acted_at",
            "delegated_to",
        )

    def get_approver_name(self, obj) -> str | None:
        from modules.identity.models import User

        user = User.objects.filter(id=obj.approver_id).first()
        if user is None:
            return None
        emp = getattr(user, "employee_profile", None)
        return emp.full_name if emp is not None else user.email


class ClaimRequestSerializer(serializers.ModelSerializer):
    approvals = ClaimApprovalSerializer(many=True, read_only=True)
    attachments = ClaimAttachmentSerializer(many=True, read_only=True)
    category_code = serializers.CharField(source="category.code", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    employee_department_name = serializers.CharField(
        source="employee.department.name", read_only=True
    )
    employee_role_title = serializers.CharField(
        source="employee.role_title", read_only=True, allow_null=True
    )
    employee_manager_name = serializers.SerializerMethodField()

    class Meta:
        model = ClaimRequest
        fields = (
            "id",
            "org_id",
            "employee",
            "employee_name",
            "employee_code",
            "employee_department_name",
            "employee_role_title",
            "employee_manager_name",
            "category",
            "category_code",
            "category_name",
            "amount",
            "currency_code",
            "expense_date",
            "description",
            "merchant",
            "business_justification",
            "status",
            "current_level",
            "submitted_at",
            "reimbursed_at",
            "reimbursement_reference",
            "approvals",
            "attachments",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "org_id",
            "employee",
            "employee_name",
            "employee_code",
            "employee_department_name",
            "employee_role_title",
            "employee_manager_name",
            "category_name",
            "status",
            "current_level",
            "submitted_at",
            "reimbursed_at",
            "reimbursement_reference",
            "approvals",
            "attachments",
            "created_at",
            "updated_at",
        )

    def get_employee_manager_name(self, obj) -> str | None:
        mgr = getattr(obj.employee, "manager", None)
        return mgr.full_name if mgr is not None else None


class ClaimActionSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class ReimburseSerializer(serializers.Serializer):
    reference = serializers.CharField(max_length=100)


class PresignedUploadSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=100)


class RegisterAttachmentSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=100)
    size_bytes = serializers.IntegerField(min_value=1)
    s3_key = serializers.CharField(max_length=500)
