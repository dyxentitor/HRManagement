from __future__ import annotations

from typing import ClassVar

from rest_framework import permissions, viewsets

from .models import Organization
from .serializers import OrganizationSerializer


class OrganizationViewSet(viewsets.ReadOnlyModelViewSet):
    """Phase 1: read-only org view at /api/v1/organizations/. Org admin endpoint
    for creating new orgs lands in M1b together with auth.
    """

    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer
    # Phase 1: temporarily public; M1b adds RBAC
    permission_classes: ClassVar = [permissions.AllowAny]
    lookup_field = "slug"
