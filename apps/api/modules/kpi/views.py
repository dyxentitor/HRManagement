"""KPI endpoints — templates, cycles, assignments, reviews."""

from __future__ import annotations

from typing import ClassVar

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response

from common.workflow.exceptions import InvalidTransition
from modules.identity.permissions import HRMSPermission

from .models import KpiAssignment, KpiCycle, KpiTemplate
from .serializers import (
    BulkAssignSerializer,
    EvidencePresignSerializer,
    KpiAssignmentSerializer,
    KpiCycleSerializer,
    KpiReviewSerializer,
    KpiTemplateSerializer,
    KpiTemplateWriteSerializer,
    SubmitManagerReviewSerializer,
    SubmitSelfReviewSerializer,
    TeamSummarySerializer,
)
from .services.assignment import AssignmentService
from .services.cycle import CycleService
from .services.review import ReviewService


class KpiTemplateViewSet(viewsets.ModelViewSet):
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_queryset(self):
        return KpiTemplate.all_objects.filter(
            org_id=self.request.user.org_id, deleted_at__isnull=True
        ).prefetch_related("definitions")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return KpiTemplateWriteSerializer
        return KpiTemplateSerializer

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["kpi:template:read"]
        return ["kpi:template:write"]

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)


class KpiCycleViewSet(viewsets.ModelViewSet):
    permission_classes: ClassVar[list] = [HRMSPermission]

    def get_queryset(self):
        return KpiCycle.all_objects.filter(
            org_id=self.request.user.org_id, deleted_at__isnull=True
        ).order_by("-starts_on")

    def get_serializer_class(self):
        return KpiCycleSerializer

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["kpi:cycle:read"]
        return ["kpi:cycle:write"]

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)

    @action(detail=True, methods=["post"], url_path="open-self-review")
    def open_self_review(self, request, pk=None):
        cycle = self.get_object()
        try:
            CycleService.transition(cycle, "self_review")
        except InvalidTransition as e:
            raise ValidationError(str(e)) from e
        return Response(KpiCycleSerializer(cycle).data)

    @action(detail=True, methods=["post"], url_path="open-manager-review")
    def open_manager_review(self, request, pk=None):
        cycle = self.get_object()
        try:
            CycleService.transition(cycle, "manager_review")
        except InvalidTransition as e:
            raise ValidationError(str(e)) from e
        return Response(KpiCycleSerializer(cycle).data)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        cycle = self.get_object()
        try:
            CycleService.transition(cycle, "closed")
        except InvalidTransition as e:
            raise ValidationError(str(e)) from e
        return Response(KpiCycleSerializer(cycle).data)


class KpiAssignmentViewSet(viewsets.GenericViewSet):
    permission_classes: ClassVar[list] = [HRMSPermission]
    serializer_class = KpiAssignmentSerializer

    def get_queryset(self):
        qs = KpiAssignment.all_objects.filter(
            org_id=self.request.user.org_id, deleted_at__isnull=True
        )
        cycle_id = self.request.query_params.get("cycle_id")
        if cycle_id:
            qs = qs.filter(cycle_id=cycle_id)
        employee_id = self.request.query_params.get("employee_id")
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        return qs

    @property
    def required_perms(self):
        if self.action == "me":
            return ["kpi:assignment:read:self"]
        if self.action == "create":
            return ["kpi:assignment:write:team"]
        return ["kpi:assignment:read:team"]

    def list(self, request):
        """GET /api/v1/kpi/assignments — team view."""
        qs = self.get_queryset()
        return Response(KpiAssignmentSerializer(qs, many=True).data)

    def create(self, request):
        """POST /api/v1/kpi/assignments — bulk-assign."""
        serializer = BulkAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            cycle = KpiCycle.all_objects.get(id=data["cycle_id"], org_id=request.user.org_id)
        except KpiCycle.DoesNotExist as e:
            raise NotFound("Cycle not found") from e

        try:
            template = KpiTemplate.all_objects.get(
                id=data["template_id"], org_id=request.user.org_id
            )
        except KpiTemplate.DoesNotExist as e:
            raise NotFound("Template not found") from e

        n = AssignmentService.bulk_assign(
            cycle=cycle,
            template=template,
            employee_ids=data["employee_ids"],
        )
        return Response({"created": n}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def me(self, request):
        """GET /api/v1/kpi/assignments/me — own assignments."""
        cycle_id = request.query_params.get("cycle_id")
        qs = KpiAssignment.all_objects.filter(
            org_id=request.user.org_id,
            employee_id=request.user.id,
            deleted_at__isnull=True,
        )
        if cycle_id:
            qs = qs.filter(cycle_id=cycle_id)
        return Response(KpiAssignmentSerializer(qs, many=True).data)


class KpiReviewViewSet(viewsets.GenericViewSet):
    """Review actions on assignments: self, manager, evidence."""

    permission_classes: ClassVar[list] = [HRMSPermission]

    def _get_assignment(self, request, assignment_id: str) -> KpiAssignment:
        try:
            return KpiAssignment.all_objects.select_related("cycle").get(
                id=assignment_id,
                org_id=request.user.org_id,
                deleted_at__isnull=True,
            )
        except KpiAssignment.DoesNotExist as e:
            raise NotFound("Assignment not found") from e

    @property
    def required_perms(self):
        if self.action in ("self_review", "evidence"):
            return ["kpi:review:write:self"]
        if self.action == "manager_review":
            return ["kpi:review:write:team"]
        return []

    @action(detail=True, methods=["post"], url_path="self")
    def self_review(self, request, pk=None):
        assignment = self._get_assignment(request, pk)
        serializer = SubmitSelfReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            review = ReviewService.submit_self(
                assignment,
                submitted_by=request.user.id,
                scores=data["scores"],
                overall_comment=data["overall_comment"],
            )
        except InvalidTransition as e:
            raise ValidationError(str(e)) from e
        return Response(KpiReviewSerializer(review).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def manager(self, request, pk=None):
        assignment = self._get_assignment(request, pk)
        serializer = SubmitManagerReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            review = ReviewService.submit_manager(
                assignment,
                submitted_by=request.user.id,
                scores=data["scores"],
                overall_comment=data["overall_comment"],
            )
        except InvalidTransition as e:
            raise ValidationError(str(e)) from e
        return Response(KpiReviewSerializer(review).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def evidence(self, request, pk=None):
        assignment = self._get_assignment(request, pk)
        serializer = EvidencePresignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Must have an existing self-review to attach evidence to
        review = assignment.reviews.filter(stage="self").order_by("-iteration").first()
        if not review:
            raise ValidationError("No self-review exists for this assignment")

        result = ReviewService.submit_evidence(
            review,
            filename=data["filename"],
            content_type=data["content_type"],
        )
        return Response(result, status=status.HTTP_200_OK)


class KpiTeamSummaryViewSet(viewsets.GenericViewSet):
    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list] = ["kpi:assignment:read:team"]

    @action(detail=False, methods=["get"], url_path="")
    def list(self, request):
        cycle_id = request.query_params.get("cycle_id")
        qs = KpiAssignment.all_objects.filter(org_id=request.user.org_id, deleted_at__isnull=True)
        if cycle_id:
            qs = qs.filter(cycle_id=cycle_id)

        result = []
        for a in qs:
            result.append(
                {
                    "assignment_id": str(a.id),
                    "employee_id": str(a.employee_id),
                    "status": a.status,
                    "self_review_count": a.reviews.filter(stage="self").count(),
                    "manager_review_count": a.reviews.filter(stage="manager").count(),
                }
            )
        serializer = TeamSummarySerializer(result, many=True)
        return Response(serializer.data)
