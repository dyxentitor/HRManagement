"""Certification + training endpoints."""

from __future__ import annotations

from typing import ClassVar

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from common.feature_flags.decorators import requires_feature
from modules.employee.models import Employee
from modules.identity.permissions import HRMSPermission

from .models import Certification, TrainingAssignment, TrainingPlan, TrainingProgress
from .serializers import (
    CertificationSerializer,
    CertificationWriteSerializer,
    CompleteAssignmentSerializer,
    PresignedUploadRequestSerializer,
    RegisterDocumentSerializer,
    TrainingAssignmentSerializer,
    TrainingAssignmentWriteSerializer,
    TrainingPlanSerializer,
    TrainingProgressSerializer,
    TrainingProgressWriteSerializer,
)
from .services.certification import get_presigned_upload_url, register_document
from .services.training import complete_assignment


@requires_feature("certification")
class CertificationViewSet(viewsets.ModelViewSet):
    """CRUD for certifications + presigned-upload + register-document."""

    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_queryset(self):
        qs = Certification.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        )
        employee_id = self.request.query_params.get("employee_id")
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        expiring_within = self.request.query_params.get("expiring_within_days")
        if expiring_within:
            try:
                import datetime

                from django.utils import timezone

                days = int(expiring_within)
                cutoff = timezone.localdate() + datetime.timedelta(days=days)
                qs = qs.filter(expires_on__lte=cutoff, status="active")
            except (ValueError, TypeError):
                pass
        return qs.order_by("expires_on")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return CertificationWriteSerializer
        return CertificationSerializer

    @property
    def required_perms(self):
        if self.action == "me":
            return ["cert:read:self"]
        if self.action in ("list", "retrieve"):
            return ["cert:read:team"]
        if self.action in ("presigned_upload", "register_document_action"):
            return ["cert:write:self"]
        return ["cert:write:self"]

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        read_serializer = CertificationSerializer(serializer.instance)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        """Return own certifications.

        Certification.employee_id is an Employee.id (per seed_demo_data),
        not a User.id — resolve the User → Employee link first, then filter.
        Mirrors the PayslipViewSet.me pattern. Returns [] if the user has no
        linked Employee (e.g., admin demo accounts).
        """
        emp = Employee.all_objects.filter(
            user_id=request.user.id,
            deleted_at__isnull=True,
        ).first()
        if emp is None:
            return Response([])
        qs = Certification.all_objects.filter(
            org_id=request.user.org_id,
            employee_id=emp.id,
            deleted_at__isnull=True,
        ).order_by("expires_on")
        serializer = CertificationSerializer(qs, many=True)
        return Response(serializer.data)

    @action(
        detail=True,
        methods=["post"],
        url_path="document/presigned-upload",
    )
    def presigned_upload(self, request, pk=None):
        """Return a presigned S3 PUT URL for uploading a certification document."""
        cert = self.get_object()
        serializer = PresignedUploadRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        content_type = serializer.validated_data.get("content_type", "application/pdf")
        result = get_presigned_upload_url(cert.id, content_type=content_type)
        return Response(result)

    @action(
        detail=True,
        methods=["post"],
        url_path="document",
    )
    def register_document_action(self, request, pk=None):
        """Register the S3 key after a successful direct upload."""
        cert = self.get_object()
        serializer = RegisterDocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        register_document(cert, s3_key=serializer.validated_data["s3_key"])
        return Response(CertificationSerializer(cert).data)


@requires_feature("training")
class TrainingPlanViewSet(viewsets.ModelViewSet):
    """CRUD for training plans."""

    serializer_class = TrainingPlanSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_queryset(self):
        return TrainingPlan.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        ).order_by("name")

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["training:plan:read"]
        return ["training:plan:write"]

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)


@requires_feature("training")
class TrainingAssignmentViewSet(viewsets.ModelViewSet):
    """Training assignments with me + complete + progress nested."""

    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_queryset(self):
        qs = TrainingAssignment.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        ).prefetch_related("progress")
        assignment_status = self.request.query_params.get("status")
        if assignment_status:
            qs = qs.filter(status=assignment_status)
        return qs.order_by("due_date")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return TrainingAssignmentWriteSerializer
        return TrainingAssignmentSerializer

    @property
    def required_perms(self):
        if self.action == "me":
            return ["training:assignment:read:self"]
        if self.action in ("list", "retrieve"):
            return ["training:assignment:write:team"]
        if self.action == "complete":
            return ["training:progress:write:self"]
        return ["training:assignment:write:team"]

    def perform_create(self, serializer):
        serializer.save(
            org_id=self.request.user.org_id,
            assigned_by=self.request.user.id,
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        read_serializer = TrainingAssignmentSerializer(serializer.instance)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        """Return own training assignments.

        TrainingAssignment.employee_id is an Employee.id (per seed_demo_data),
        not a User.id — resolve User → Employee first. Returns [] if the user
        has no linked Employee row.
        """
        emp = Employee.all_objects.filter(
            user_id=request.user.id,
            deleted_at__isnull=True,
        ).first()
        if emp is None:
            return Response([])
        qs = (
            TrainingAssignment.all_objects.filter(
                org_id=request.user.org_id,
                employee_id=emp.id,
                deleted_at__isnull=True,
            )
            .prefetch_related("progress")
            .order_by("due_date")
        )
        serializer = TrainingAssignmentSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        """Mark assignment completed with optional evidence."""
        assignment = self.get_object()
        serializer = CompleteAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        complete_assignment(assignment, evidence_s3_key=serializer.validated_data["s3_key"])
        return Response(TrainingAssignmentSerializer(assignment).data)

    @action(detail=True, methods=["get"], url_path="progress")
    def progress(self, request, pk=None):
        """Return progress entries for this assignment."""
        assignment = self.get_object()
        entries = TrainingProgress.objects.filter(assignment=assignment).order_by("-ts")
        serializer = TrainingProgressSerializer(entries, many=True)
        return Response(serializer.data)


@requires_feature("training")
class TrainingProgressViewSet(viewsets.GenericViewSet):
    """Write-only viewset for progress updates."""

    serializer_class = TrainingProgressWriteSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list] = ["training:progress:write:self"]

    def get_queryset(self):
        return TrainingProgress.objects.filter(assignment__org_id=self.request.user.org_id)

    def partial_update(self, request, pk=None):
        try:
            instance = TrainingProgress.objects.get(pk=pk, assignment__org_id=request.user.org_id)
        except TrainingProgress.DoesNotExist as exc:
            raise NotFound() from exc
        serializer = TrainingProgressWriteSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(TrainingProgressSerializer(instance).data)

    def create(self, request):
        serializer = TrainingProgressWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(
            TrainingProgressSerializer(instance).data,
            status=status.HTTP_201_CREATED,
        )
