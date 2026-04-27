"""Claim endpoints — categories, policies, requests, attachments."""

from __future__ import annotations

from typing import ClassVar

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response

from common.workflow import Decision
from modules.employee.models import Employee
from modules.identity.permissions import HRMSPermission

from .models import ClaimCategory, ClaimPolicy, ClaimRequest
from .serializers import (
    ClaimActionSerializer,
    ClaimAttachmentSerializer,
    ClaimCategorySerializer,
    ClaimPolicySerializer,
    ClaimRequestSerializer,
    PresignedUploadSerializer,
    RegisterAttachmentSerializer,
    ReimburseSerializer,
)
from .services.attachment import AttachmentService
from .services.claim_request import ClaimRequestService


class ClaimCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = ClaimCategorySerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_queryset(self):
        return ClaimCategory.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        ).order_by("code")

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["claim:read:self"]
        return ["claim:category:write"]

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)


class ClaimPolicyViewSet(viewsets.ModelViewSet):
    serializer_class = ClaimPolicySerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_queryset(self):
        return ClaimPolicy.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        )

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["claim:read:self"]
        return ["claim:policy:write"]

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)


class ClaimRequestViewSet(viewsets.ModelViewSet):
    serializer_class = ClaimRequestSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_queryset(self):
        scope = self.request.query_params.get("scope", "self")
        emp = Employee.all_objects.filter(user_id=self.request.user.id).first()
        qs = ClaimRequest.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        )
        # Detail/action views: return all org claims and let service/engine gate access
        if self.action in (
            "approve",
            "reject",
            "mark_reimbursed",
            "retrieve",
            "attachments",
            "presigned_upload",
        ):
            return qs
        if scope == "self":
            return qs.filter(employee_id=emp.id if emp else None)
        if scope == "team":
            if not emp:
                return qs.none()
            report_ids = list(Employee.all_objects.filter(manager=emp).values_list("id", flat=True))
            return qs.filter(employee_id__in=[*report_ids, emp.id])
        if scope == "finance-queue":
            return qs.filter(status="finance_approved")
        return qs

    def get_required_perms(self):
        if self.action == "create":
            return ["claim:create:self"]
        if self.action in ("list", "retrieve"):
            scope = self.request.query_params.get("scope", "self")
            return {
                "self": ["claim:read:self"],
                "team": ["claim:read:team"],
                "finance-queue": ["claim:read:finance"],
                "org": ["claim:read:org"],
            }.get(scope, ["claim:read:self"])
        if self.action == "submit":
            return ["claim:create:self"]
        if self.action in ("approve", "reject"):
            # Accept either manager or finance approver code; the engine's
            # NotAuthorizedToAct will catch the wrong actor at runtime.
            # Follow-up: split into two separate actions for finer perm control.
            return ["claim:approve:team"]
        if self.action == "cancel":
            return ["claim:cancel:self"]
        if self.action == "mark_reimbursed":
            return ["claim:reimburse:finance"]
        if self.action in ("attachments", "presigned_upload"):
            return ["claim:create:self"]
        return []

    @property
    def required_perms(self):
        return self.get_required_perms()

    def perform_create(self, serializer):
        emp = Employee.all_objects.filter(user_id=self.request.user.id).first()
        if not emp:
            raise NotFound("No employee profile linked to this user.")
        serializer.save(org_id=self.request.user.org_id, employee=emp)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        claim = self.get_object()
        ClaimRequestService.submit(claim, actor=request.user)
        claim.refresh_from_db()
        return Response(self.get_serializer(claim).data)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        claim = self.get_object()
        ser = ClaimActionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ClaimRequestService.act(
            claim,
            actor=request.user,
            decision=Decision.APPROVE,
            comment=ser.validated_data.get("comment", ""),
        )
        claim.refresh_from_db()
        return Response(self.get_serializer(claim).data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        claim = self.get_object()
        ser = ClaimActionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        comment = ser.validated_data.get("comment", "").strip()
        if not comment:
            raise ValidationError({"comment": "Required when rejecting"})
        ClaimRequestService.act(
            claim,
            actor=request.user,
            decision=Decision.REJECT,
            comment=comment,
        )
        claim.refresh_from_db()
        return Response(self.get_serializer(claim).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        claim = self.get_object()
        ClaimRequestService.cancel(claim, actor=request.user)
        claim.refresh_from_db()
        return Response(self.get_serializer(claim).data)

    @action(detail=True, methods=["post"], url_path="mark-reimbursed")
    def mark_reimbursed(self, request, pk=None):
        claim = self.get_object()
        ser = ReimburseSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ClaimRequestService.mark_reimbursed(
            claim,
            reference=ser.validated_data["reference"],
            actor_id=request.user.id,
        )
        claim.refresh_from_db()
        return Response(self.get_serializer(claim).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="attachments/presigned-upload",
    )
    def presigned_upload(self, request, pk=None):
        claim = self.get_object()
        ser = PresignedUploadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = AttachmentService.presigned_upload(
            claim=claim,
            filename=ser.validated_data["filename"],
            content_type=ser.validated_data["content_type"],
        )
        return Response(result)

    @action(detail=True, methods=["post", "get"], url_path="attachments")
    def attachments(self, request, pk=None):
        claim = self.get_object()
        if request.method == "GET":
            ser = ClaimAttachmentSerializer(claim.attachments.all(), many=True)
            return Response(ser.data)
        # POST: register a new attachment after S3 PUT
        ser = RegisterAttachmentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        att = AttachmentService.register(
            claim=claim,
            filename=ser.validated_data["filename"],
            content_type=ser.validated_data["content_type"],
            size_bytes=ser.validated_data["size_bytes"],
            s3_key=ser.validated_data["s3_key"],
            uploaded_by=request.user.id,
        )
        return Response(ClaimAttachmentSerializer(att).data, status=status.HTTP_201_CREATED)
