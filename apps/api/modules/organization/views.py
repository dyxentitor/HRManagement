from __future__ import annotations

import uuid
from typing import ClassVar

from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.generics import GenericAPIView
from rest_framework.mixins import RetrieveModelMixin, UpdateModelMixin
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit.service import append as audit_append
from modules.employee.services.avatar import presigned_put_url
from modules.identity.permissions import HRMSPermission

from .models import Department, Organization
from .serializers import DepartmentSerializer, OrganizationSerializer, OrgSettingsSerializer
from .tasks import process_org_logo

LOGO_ALLOWED_CONTENT_TYPES: frozenset[str] = frozenset({"image/png", "image/jpeg", "image/webp"})
LOGO_EXT_MAP: dict[str, str] = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}
LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024  # 2 MB


class OrganizationViewSet(viewsets.ReadOnlyModelViewSet):
    """Phase 1: read-only org view at /api/v1/organizations/."""

    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer
    permission_classes: ClassVar = [HRMSPermission]
    required_perms: ClassVar = ["org:settings:read"]
    lookup_field = "slug"


class DepartmentViewSet(viewsets.ModelViewSet):
    serializer_class = DepartmentSerializer
    permission_classes: ClassVar = [HRMSPermission]

    def get_queryset(self):
        # TenantContext middleware (Task 2) sets current_org_id from the
        # authenticated user, so the default manager auto-scopes by org.
        return Department.objects.all().order_by("name")

    def get_required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["department:read"]
        return ["department:write"]

    @property
    def required_perms(self):
        return self.get_required_perms()

    def perform_create(self, serializer):
        # org_id derived from the authenticated user's context
        serializer.save(org_id=self.request.user.org_id)

    def perform_destroy(self, instance):
        # v1.9.0 — refuse to delete a department that still has active members.
        # Soft-deleted employees do NOT block; HR should reassign or restore them.
        from modules.employee.models import Employee

        if Employee.objects.filter(department_id=instance.id, deleted_at__isnull=True).exists():
            raise ValidationError(
                {"detail": "Department has active employees; reassign before deleting."}
            )
        super().perform_destroy(instance)


class OrgSettingsView(RetrieveModelMixin, UpdateModelMixin, GenericAPIView):
    """GET/PATCH the current user's organization settings."""

    serializer_class = OrgSettingsSerializer
    permission_classes: ClassVar = [HRMSPermission]

    def get_object(self):
        return Organization.objects.get(id=self.request.user.org_id)

    @property
    def required_perms(self):
        return ["org:settings:read"] if self.request.method == "GET" else ["org:settings:write"]

    def get(self, request, *args, **kwargs):
        return self.retrieve(request, *args, **kwargs)

    def patch(self, request, *args, **kwargs):
        instance = self.get_object()
        before = {
            f: getattr(instance, f)
            for f in (
                "name",
                "default_currency",
                "default_timezone",
                "default_locale",
                "settings",
            )
        }
        response = self.partial_update(request, *args, **kwargs)
        instance.refresh_from_db()
        changed = [f for f, v in before.items() if getattr(instance, f) != v]
        if changed:
            audit_append(
                org_id=instance.id,
                action="org.settings_updated",
                entity="organization",
                entity_id=instance.id,
                after={"changed_fields": changed},
            )
        return response


class OrgLogoPresignedUploadView(APIView):
    """POST /api/v1/org/logo/presigned-upload — returns {presigned_url, s3_key}."""

    permission_classes: ClassVar = [HRMSPermission]
    required_perms: ClassVar = ["org:settings:write"]

    def post(self, request):
        content_type = request.data.get("content_type")
        if content_type not in LOGO_ALLOWED_CONTENT_TYPES:
            raise ValidationError(
                {"content_type": "Must be one of image/png, image/jpeg, image/webp."}
            )
        ext = LOGO_EXT_MAP[content_type]
        org_id = request.user.org_id
        s3_key = f"org-logos/raw/{org_id}/{uuid.uuid4()}.{ext}"
        url = presigned_put_url(s3_key, content_type, expires_in=300)
        return Response({"presigned_url": url, "s3_key": s3_key})


class OrgLogoView(APIView):
    """POST /api/v1/org/logo (register) + DELETE /api/v1/org/logo (clear)."""

    permission_classes: ClassVar = [HRMSPermission]
    required_perms: ClassVar = ["org:settings:write"]

    def post(self, request):
        s3_key = request.data.get("s3_key")
        content_type = request.data.get("content_type")
        size_bytes = request.data.get("size_bytes")
        if not s3_key or not content_type or size_bytes is None:
            raise ValidationError({"detail": "s3_key, content_type, size_bytes required."})
        if content_type not in LOGO_ALLOWED_CONTENT_TYPES:
            raise ValidationError({"content_type": "Must be PNG, JPEG, or WebP."})
        try:
            size_int = int(size_bytes)
        except (TypeError, ValueError) as exc:
            raise ValidationError({"size_bytes": "Must be an integer."}) from exc
        if size_int <= 0 or size_int > LOGO_MAX_SIZE_BYTES:
            raise ValidationError({"size_bytes": "Max file size is 2 MB."})
        org_id = request.user.org_id
        expected_prefix = f"org-logos/raw/{org_id}/"
        if not s3_key.startswith(expected_prefix):
            raise ValidationError({"s3_key": f"must start with {expected_prefix}"})

        org = Organization.objects.get(id=org_id)
        org.logo_s3_key = s3_key
        org.save(update_fields=["logo_s3_key", "updated_at"])
        process_org_logo.delay(str(org.id), s3_key)
        audit_append(
            org_id=org.id,
            action="org.logo_updated",
            entity="organization",
            entity_id=org.id,
            after={"s3_key": s3_key},
        )
        return Response(OrgSettingsSerializer(org).data)

    def delete(self, request):
        org = Organization.objects.get(id=request.user.org_id)
        if org.logo_s3_key:
            prior = org.logo_s3_key
            org.logo_s3_key = None
            org.save(update_fields=["logo_s3_key", "updated_at"])
            audit_append(
                org_id=org.id,
                action="org.logo_removed",
                entity="organization",
                entity_id=org.id,
                before={"s3_key": prior},
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
