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
    class Meta:
        model = ClaimApproval
        fields = (
            "id",
            "level",
            "approver_id",
            "status",
            "comment",
            "acted_at",
            "delegated_to",
        )


class ClaimRequestSerializer(serializers.ModelSerializer):
    approvals = ClaimApprovalSerializer(many=True, read_only=True)
    attachments = ClaimAttachmentSerializer(many=True, read_only=True)
    category_code = serializers.CharField(source="category.code", read_only=True)

    class Meta:
        model = ClaimRequest
        fields = (
            "id",
            "org_id",
            "employee",
            "category",
            "category_code",
            "amount",
            "currency_code",
            "expense_date",
            "description",
            "merchant",
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
