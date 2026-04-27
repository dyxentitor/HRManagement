from __future__ import annotations

from typing import ClassVar

from rest_framework import permissions, viewsets
from rest_framework.exceptions import ValidationError

from .models import Department, Organization
from .serializers import DepartmentSerializer, OrganizationSerializer


class OrganizationViewSet(viewsets.ReadOnlyModelViewSet):
    """Phase 1: read-only org view at /api/v1/organizations/. Org admin endpoint
    for creating new orgs lands in M1b together with auth.
    """

    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer
    # Phase 1: temporarily public; M1b adds RBAC
    permission_classes: ClassVar = [permissions.AllowAny]
    lookup_field = "slug"


class DepartmentViewSet(viewsets.ModelViewSet):
    serializer_class = DepartmentSerializer
    permission_classes: ClassVar = [permissions.AllowAny]  # M1b will gate by department:read/write

    def get_queryset(self):
        # In M1a, AuthN doesn't exist yet — exposed read returns all departments
        # for inspection. M1b will add a TenantContext middleware that sets
        # current_org_id from the authenticated user, and this manager will scope automatically.
        return Department.all_objects.all().order_by("name")

    def perform_create(self, serializer):
        # In M1b, this org_id will come from the authenticated user.
        # Until then, callers must pass `org_id` in the request payload.
        org_id = self.request.data.get("org_id")
        if not org_id:
            raise ValidationError(
                {"org_id": "required (M1b will derive this from the auth context)"}
            )
        serializer.save(org_id=org_id)
