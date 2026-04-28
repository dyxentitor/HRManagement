"""Payslip + Payroll viewsets."""

from __future__ import annotations

from typing import ClassVar

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from common.workflow.exceptions import InvalidTransition
from modules.employee.models import Employee
from modules.identity.permissions import HRMSPermission

from .models import PayrollPeriod, PayrollRun, PayslipRecord
from .serializers import (
    PayrollPeriodSerializer,
    PayrollRunSerializer,
    PayslipRecordSerializer,
)
from .services.csv_import import import_csv
from .services.publish import publish_run


class PayslipViewSet(viewsets.ReadOnlyModelViewSet):
    """Employee payslips.

    GET /api/v1/payslips/me       — own payslips
    GET /api/v1/payslips/{id}/    — single payslip + presigned PDF URL
    """

    serializer_class = PayslipRecordSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    @property
    def required_perms(self):
        # `me`, `retrieve`, and `list` are scoped to own payslips by
        # get_queryset() when the user lacks payslip:read:org, so the
        # `:self` perm is sufficient. Any mutating action requires
        # the org-level perm.
        if self.action in ("me", "retrieve", "list"):
            return ["payslip:read:self"]
        return ["payslip:read:org"]

    def get_queryset(self):
        qs = PayslipRecord.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        ).select_related("period")
        # Scope to own payslips unless user has org-read permission
        from modules.identity.services.permissions import get_user_perms

        perms = get_user_perms(self.request.user)
        if "payslip:read:org" not in perms:
            emp = Employee.all_objects.filter(
                user_id=self.request.user.id,
                deleted_at__isnull=True,
            ).first()
            if emp is None:
                return PayslipRecord.objects.none()
            qs = qs.filter(employee_id=emp.id)
        return qs.order_by("-period__period_start")

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        """List payslips for the authenticated employee."""
        emp = Employee.all_objects.filter(
            user_id=request.user.id,
            deleted_at__isnull=True,
        ).first()
        if emp is None:
            return Response([])
        qs = (
            PayslipRecord.all_objects.filter(
                org_id=request.user.org_id,
                employee_id=emp.id,
                deleted_at__isnull=True,
            )
            .select_related("period")
            .order_by("-period__period_start")
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


class PayrollPeriodViewSet(viewsets.ModelViewSet):
    """Payroll periods — list/create/update for HR/finance."""

    serializer_class = PayrollPeriodSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["payslip:read:org"]
        return ["payroll:period:write"]

    def get_queryset(self):
        return PayrollPeriod.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        ).order_by("-period_start")

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)


class PayrollRunViewSet(viewsets.GenericViewSet):
    """Payroll run management.

    POST /api/v1/payroll/runs/              — upload CSV + auto-import
    GET  /api/v1/payroll/runs/              — list runs
    GET  /api/v1/payroll/runs/{id}/         — retrieve a run
    POST /api/v1/payroll/runs/{id}/preview  — {row_count, errors, first_5_payslips}
    POST /api/v1/payroll/runs/{id}/publish  — publish the run
    GET  /api/v1/payroll/runs/{id}/errors   — row-level errors
    """

    serializer_class = PayrollRunSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]
    parser_classes: ClassVar[list] = [MultiPartParser]

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve", "errors", "preview"):
            return ["payslip:read:org"]
        if self.action == "publish":
            return ["payroll:run:publish"]
        return ["payroll:run:create"]

    def get_queryset(self):
        return (
            PayrollRun.all_objects.filter(
                org_id=self.request.user.org_id,
                deleted_at__isnull=True,
            )
            .select_related("period")
            .order_by("-created_at")
        )

    def list(self, request):
        qs = self.get_queryset()
        return Response(PayrollRunSerializer(qs, many=True).data)

    def retrieve(self, request, pk=None):
        run = self.get_object()
        return Response(PayrollRunSerializer(run).data)

    def create(self, request):
        """Multipart upload: { period (UUID), csv (file) }."""
        period_id = request.data.get("period")
        csv_file = request.FILES.get("csv")
        if not period_id:
            raise ValidationError({"period": "This field is required."})
        if not csv_file:
            raise ValidationError({"csv": "A CSV file is required."})

        period = PayrollPeriod.all_objects.filter(
            id=period_id,
            org_id=request.user.org_id,
            deleted_at__isnull=True,
        ).first()
        if period is None:
            raise NotFound("Period not found.")

        run = PayrollRun.all_objects.create(
            org_id=request.user.org_id,
            period=period,
            uploaded_by=request.user.id,
        )

        csv_text = csv_file.read().decode("utf-8", errors="replace")
        n_imported, errors = import_csv(run=run, csv_text=csv_text)
        run.refresh_from_db()

        return Response(
            {
                "run_id": str(run.id),
                "status": run.status,
                "row_count": n_imported,
                "errors": errors,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def preview(self, request, pk=None):
        """Return {row_count, errors, first_5_payslips} for a run."""
        run = self.get_object()
        payslips = (
            PayslipRecord.all_objects.filter(
                period=run.period,
                status="draft",
                deleted_at__isnull=True,
            )
            .select_related("period")
            .order_by("created_at")[:5]
        )

        return Response(
            {
                "row_count": run.row_count,
                "errors": run.errors,
                "first_5_payslips": PayslipRecordSerializer(
                    payslips, many=True, context={"request": request}
                ).data,
            }
        )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        """Publish the run — generate PDFs + write ledger."""
        run = self.get_object()
        try:
            n_published = publish_run(run=run, actor_id=request.user.id)
        except InvalidTransition as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        return Response({"published": n_published})

    @action(detail=True, methods=["get"])
    def errors(self, request, pk=None):
        """Return row-level validation errors for this run."""
        run = self.get_object()
        return Response({"run_id": str(run.id), "errors": run.errors})
