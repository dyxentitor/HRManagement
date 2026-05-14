"""Reporting API views."""

from __future__ import annotations

from typing import ClassVar

from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.feature_flags.decorators import requires_feature
from common.storage.s3 import bucket, public_s3_client
from modules.identity.permissions import HRMSPermission

from .models import ReportExportJob, SavedView
from .registry import REGISTRY
from .serializers import ReportExportJobSerializer, SavedViewSerializer

_PAGE_SIZE_DEFAULT = 50
_PAGE_SIZE_MAX = 500


def _s3_presign(s3_key: str) -> str:
    return public_s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket(), "Key": s3_key},
        ExpiresIn=3600,
    )


@requires_feature("reports")
class ReportListView(APIView):
    """GET /api/v1/reports — list visible reports for user."""

    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list] = ["report:list"]

    def get(self, request: Request) -> Response:
        user = request.user
        result = []
        for _code, cls in sorted(REGISTRY.items()):
            if cls.is_visible_for(user):
                result.append(
                    {
                        "code": cls.code,
                        "title": cls.title,
                        "exporters": cls.exporters,
                    }
                )
        return Response(result)


@requires_feature("reports")
class ReportSchemaView(APIView):
    """GET /api/v1/reports/{code}/schema — columns + filter spec for UI."""

    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list] = ["report:run"]

    def get(self, request: Request, code: str) -> Response:
        cls = REGISTRY.get(code)
        if cls is None:
            raise NotFound(f"Report not found: {code}")
        return Response(cls.schema())


@requires_feature("reports")
class ReportRunView(APIView):
    """POST /api/v1/reports/{code}/run — body: {filters, page?, page_size?}."""

    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list] = ["report:run"]

    def post(self, request: Request, code: str) -> Response:
        cls = REGISTRY.get(code)
        if cls is None:
            raise NotFound(f"Report not found: {code}")

        filters = request.data.get("filters", {})
        page = int(request.data.get("page", 1))
        page_size = min(int(request.data.get("page_size", _PAGE_SIZE_DEFAULT)), _PAGE_SIZE_MAX)
        offset = (page - 1) * page_size

        qs = cls.queryset(filters=filters, user=request.user)
        # Support both QuerySet and list
        total = len(qs) if isinstance(qs, list) else qs.count()
        items = qs[offset : offset + page_size]
        rows = [cls.serialize_row(r) for r in items]

        return Response(
            {
                "code": cls.code,
                "total": total,
                "page": page,
                "page_size": page_size,
                "columns": cls.columns,
                "rows": rows,
            }
        )


@requires_feature("reports")
class ReportExportView(APIView):
    """POST /api/v1/reports/{code}/export — body: {filters, format} -> 202 + job_id."""

    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list] = ["report:export"]

    def post(self, request: Request, code: str) -> Response:
        cls = REGISTRY.get(code)
        if cls is None:
            raise NotFound(f"Report not found: {code}")

        fmt = request.data.get("format", "csv")
        if fmt not in cls.exporters:
            raise ValidationError(f"Format '{fmt}' not supported for this report.")

        filters = request.data.get("filters", {})
        job = ReportExportJob.objects.create(
            org_id=request.user.org_id,
            user=request.user,
            report_code=code,
            filters=filters,
            format=fmt,
        )

        from .tasks import run_export

        run_export.delay(job.id)
        return Response({"job_id": job.id}, status=202)


@requires_feature("reports")
class ReportJobDetailView(APIView):
    """GET /api/v1/reports/jobs/{job_id} — poll status."""

    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list] = ["report:export"]

    def get(self, request: Request, job_id: int) -> Response:
        try:
            job = ReportExportJob.objects.get(id=job_id, user=request.user)
        except ReportExportJob.DoesNotExist as err:
            raise NotFound("Job not found.") from err

        data = ReportExportJobSerializer(job).data
        if job.status == "done" and job.s3_key:
            try:
                data["download_url"] = _s3_presign(job.s3_key)
            except Exception:
                data["download_url"] = None
        return Response(data)


@requires_feature("reports")
class SavedViewListCreateView(APIView):
    """GET /api/v1/reports/saved-views?code=   POST /api/v1/reports/saved-views."""

    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list] = ["report:saved_view:write"]

    def get(self, request: Request) -> Response:
        qs = SavedView.objects.filter(user=request.user)
        code = request.query_params.get("code")
        if code:
            qs = qs.filter(report_code=code)
        return Response(SavedViewSerializer(qs, many=True).data)

    def post(self, request: Request) -> Response:
        ser = SavedViewSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(user=request.user)
        return Response(ser.data, status=201)


@requires_feature("reports")
class SavedViewDeleteView(APIView):
    """DELETE /api/v1/reports/saved-views/{id}."""

    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list] = ["report:saved_view:write"]

    def delete(self, request: Request, pk: int) -> Response:
        try:
            sv = SavedView.objects.get(id=pk, user=request.user)
        except SavedView.DoesNotExist as err:
            raise NotFound("Saved view not found.") from err
        sv.delete()
        return Response(status=204)
