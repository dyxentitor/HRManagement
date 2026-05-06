"""Employee CRUD viewset + /employees/me shortcut."""

from __future__ import annotations

import datetime
import uuid
from typing import ClassVar

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response

from modules.identity.permissions import HRMSPermission

from .models import Employee, Team
from .serializers import (
    EmployeeAssignmentSerializer,
    EmployeeMeSerializer,
    EmployeeSerializer,
    TeamSerializer,
)


class EmployeeViewSet(viewsets.ModelViewSet):
    """HR-facing employee CRUD."""

    serializer_class = EmployeeSerializer
    permission_classes: ClassVar = [HRMSPermission]
    BANK_FIELDS: ClassVar[frozenset[str]] = frozenset({"bank_name", "bank_account_number"})
    ASSIGN_SCOPE_KEYS: ClassVar[frozenset[str]] = frozenset({"team", "team_id"})
    # Use get_queryset() so TenantScopedManager re-evaluates org_id at request time.
    # A class-level queryset = Employee.objects.all() would capture org_id=None at
    # class-load time and always return empty results.
    queryset = Employee.objects.none()  # required by DRF router for basename detection

    def get_queryset(self):
        return Employee.objects.all()

    @property
    def required_perms(self) -> list[str]:
        action = self.action
        if action == "me":
            if self.request.method == "GET":
                return ["employee:read:self"]
            return ["employee:write:self"]
        if action in ("list", "reporting_chain", "direct_reports", "probation_status"):
            return ["employee:read:org"]
        if action == "retrieve":
            # Either `employee:read:org` (HR view) OR `employee:assign:team`
            # (team_lead/manager view-to-assign so the v1.6.0 narrow-PATCH UI
            # can pre-fill). Inline check below in `retrieve()`.
            return []
        if action == "create":
            return ["employee:create"]
        if action == "update":
            return ["employee:write:org"]
        if action == "partial_update":
            # Both perm branches handled inside `partial_update`. Returning []
            # leaves auth + tenant-scope intact via HRMSPermission.
            return []
        if action == "destroy":
            return ["employee:archive"]
        if action in ("me_photo_presigned_upload", "me_photo"):
            # Same gate as the existing /me action: any authenticated user with
            # a linked Employee record. Inline 404 in the action handles the
            # "no linked Employee" case.
            return []
        if action in (
            "employee_photo_presigned_upload",
            "employee_photo",
        ):
            return ["employee:write:org"]
        return []

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)

    def retrieve(self, request, *args, **kwargs):
        from rest_framework.exceptions import PermissionDenied

        from modules.identity.services.permissions import get_user_perms

        perms = get_user_perms(request.user)
        if not (perms & {"employee:read:org", "employee:assign:team"}):
            raise PermissionDenied("You do not have permission to view this employee.")
        return super().retrieve(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        from rest_framework.exceptions import PermissionDenied

        from modules.identity.services.permissions import get_user_perms

        user_perms = get_user_perms(request.user)
        body_keys = set(request.data.keys())

        if "employee:write:org" in user_perms:
            return super().partial_update(request, *args, **kwargs)

        if (
            "employee:assign:team" in user_perms
            and body_keys
            and body_keys.issubset(self.ASSIGN_SCOPE_KEYS)
        ):
            instance = self.get_object()
            ser = EmployeeAssignmentSerializer(
                instance,
                data=request.data,
                partial=True,
                context={"request": request},
            )
            ser.is_valid(raise_exception=True)
            ser.save()
            return Response(EmployeeSerializer(instance, context={"request": request}).data)

        raise PermissionDenied("You do not have permission to edit this employee.")

    @action(detail=False, methods=["get", "patch"], url_path="me")
    def me(self, request, *args, **kwargs):
        emp = Employee.objects.filter(user_id=request.user.id).first()
        if not emp:
            raise NotFound("No employee profile linked to this user.")

        if request.method == "GET":
            return Response(EmployeeMeSerializer(emp, context={"request": request}).data)

        # Re-MFA check on bank fields
        if any(k in self.BANK_FIELDS for k in request.data.keys()):
            from modules.identity.services.mfa import verify_code_for_user

            mfa_code = request.headers.get("X-MFA-Code", "")
            if not mfa_code:
                raise ValidationError({"mfa": "X-MFA-Code header required for bank field changes"})
            if not verify_code_for_user(request.user, mfa_code):
                raise ValidationError({"mfa": "Invalid MFA code"})

        ser = EmployeeMeSerializer(
            emp, data=request.data, partial=True, context={"request": request}
        )
        ser.is_valid(raise_exception=True)
        ser.save()

        # Recompute bank_account_last4 if bank_account_number was supplied
        if request.data.get("bank_account_number"):
            emp.bank_account_last4 = request.data["bank_account_number"][-4:]
            emp.save(update_fields=["bank_account_last4", "updated_at"])

        # Notify HR if any bank field changed
        if any(k in self.BANK_FIELDS for k in request.data.keys()):
            from .services import EmployeeService

            EmployeeService.notify_hr_of_bank_change(emp)

        return Response(ser.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="reporting-chain")
    def reporting_chain(self, request, pk=None):
        emp = self.get_object()
        from modules.identity.services.org import OrgService

        chain = OrgService().get_reporting_chain(emp.id)
        ser = self.get_serializer(chain, many=True)
        return Response(ser.data)

    @action(detail=True, methods=["get"], url_path="direct-reports")
    def direct_reports(self, request, pk=None):
        emp = self.get_object()
        reports = Employee.objects.filter(manager=emp)
        ser = self.get_serializer(reports, many=True)
        return Response(ser.data)

    @action(detail=True, methods=["get"], url_path="probation-status")
    def probation_status(self, request, pk=None):
        emp = self.get_object()
        end = emp.probation_end_date
        if end is None:
            body = {"status": "confirmed", "days_remaining": None, "probation_end_date": None}
        else:
            today = datetime.date.today()
            delta = (end - today).days
            if delta > 0:
                status_str = "in_probation"
            elif delta == 0:
                status_str = "due_today"
            else:
                status_str = "overdue_confirmation"
            body = {
                "status": status_str,
                "days_remaining": delta,
                "probation_end_date": end.isoformat(),
            }
        return Response(body)

    # --- Photo upload (v1.7.0) ---

    PHOTO_ALLOWED_TYPES: ClassVar[frozenset[str]] = frozenset(
        {"image/jpeg", "image/png", "image/webp"}
    )
    PHOTO_MAX_SIZE_BYTES: ClassVar[int] = 5 * 1024 * 1024  # 5 MB

    def _photo_ext(self, content_type: str) -> str:
        return {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(
            content_type, "bin"
        )

    def _validate_photo_upload_body(self, request) -> tuple[str, str]:
        filename = request.data.get("filename")
        content_type = request.data.get("content_type")
        if not filename or not content_type:
            raise ValidationError({"detail": "filename and content_type are required."})
        if content_type not in self.PHOTO_ALLOWED_TYPES:
            raise ValidationError(
                {"content_type": f"must be one of {sorted(self.PHOTO_ALLOWED_TYPES)}"}
            )
        return filename, content_type

    def _validate_photo_register_body(self, request, employee: Employee) -> tuple[str, int]:
        s3_key = request.data.get("s3_key")
        content_type = request.data.get("content_type")
        size_bytes = request.data.get("size_bytes")
        if not s3_key or not content_type or size_bytes is None:
            raise ValidationError({"detail": "s3_key, content_type, size_bytes required."})
        if content_type not in self.PHOTO_ALLOWED_TYPES:
            raise ValidationError({"content_type": "invalid"})
        try:
            size_int = int(size_bytes)
        except (TypeError, ValueError):
            raise ValidationError({"size_bytes": "must be an integer"}) from None
        if size_int <= 0 or size_int > self.PHOTO_MAX_SIZE_BYTES:
            raise ValidationError({"size_bytes": f"must be 1..{self.PHOTO_MAX_SIZE_BYTES}"})
        expected_prefix = f"avatars/originals/{employee.id}/"
        if not s3_key.startswith(expected_prefix):
            raise ValidationError({"s3_key": f"must start with {expected_prefix}"})
        return s3_key, size_int

    def _do_presigned_upload(self, employee: Employee, request):
        from .services.avatar import presigned_put_url

        _filename, content_type = self._validate_photo_upload_body(request)
        ext = self._photo_ext(content_type)
        s3_key = f"avatars/originals/{employee.id}/{uuid.uuid4()}.{ext}"
        url = presigned_put_url(s3_key, content_type, expires_in=300)
        return Response(
            {
                "presigned_url": url,
                "s3_key": s3_key,
                "max_size_bytes": self.PHOTO_MAX_SIZE_BYTES,
                "content_type": content_type,
            }
        )

    def _do_register(self, employee: Employee, request):
        from .tasks import process_avatar_upload

        s3_key, _size = self._validate_photo_register_body(request, employee)
        process_avatar_upload.delay(str(employee.id), s3_key)
        return Response({"processing": True}, status=status.HTTP_202_ACCEPTED)

    def _do_delete_photo(self, employee: Employee):
        from .services.avatar import delete_object

        old_key = employee.photo_s3_key
        if old_key:
            delete_object(old_key)
        employee.photo_s3_key = ""
        employee.save(update_fields=["photo_s3_key", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="me/photo/presigned-upload")
    def me_photo_presigned_upload(self, request):
        emp = Employee.objects.filter(user_id=request.user.id).first()
        if not emp:
            raise NotFound("No employee profile linked to this user.")
        return self._do_presigned_upload(emp, request)

    @action(detail=False, methods=["post", "delete"], url_path="me/photo")
    def me_photo(self, request):
        emp = Employee.objects.filter(user_id=request.user.id).first()
        if not emp:
            raise NotFound("No employee profile linked to this user.")
        if request.method == "POST":
            return self._do_register(emp, request)
        return self._do_delete_photo(emp)

    @action(detail=True, methods=["post"], url_path="photo/presigned-upload")
    def employee_photo_presigned_upload(self, request, pk=None):
        emp = self.get_object()
        return self._do_presigned_upload(emp, request)

    @action(detail=True, methods=["post", "delete"], url_path="photo")
    def employee_photo(self, request, pk=None):
        emp = self.get_object()
        if request.method == "POST":
            return self._do_register(emp, request)
        return self._do_delete_photo(emp)


class TeamViewSet(viewsets.ModelViewSet):
    """CRUD for org-defined work teams used to group roster rows."""

    serializer_class = TeamSerializer
    permission_classes: ClassVar = [HRMSPermission]
    queryset = Team.objects.none()  # required by DRF router for basename detection

    def get_queryset(self):
        return Team.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        ).order_by("sort_order", "name")

    @property
    def required_perms(self) -> list[str]:
        if self.action in ("list", "retrieve"):
            return ["team:read"]
        return ["team:write"]

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id)
