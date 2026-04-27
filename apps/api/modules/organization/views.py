from __future__ import annotations

from typing import ClassVar

from rest_framework import viewsets
from rest_framework.generics import GenericAPIView
from rest_framework.mixins import RetrieveModelMixin, UpdateModelMixin

from modules.identity.permissions import HRMSPermission

from .models import Department, Organization
from .serializers import DepartmentSerializer, OrganizationSerializer, OrgSettingsSerializer


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
        return self.partial_update(request, *args, **kwargs)
