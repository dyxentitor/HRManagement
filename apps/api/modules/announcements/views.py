"""Announcement viewset — perm-gated CRUD."""

from __future__ import annotations

from typing import ClassVar

from rest_framework import viewsets

from modules.identity.permissions import HRMSPermission

from .models import Announcement
from .serializers import AnnouncementSerializer


class AnnouncementViewSet(viewsets.ModelViewSet):
    """Company announcements.

    Read gated on announcement:read (every org user); write on announcement:write.
    """

    serializer_class = AnnouncementSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["announcement:read"]
        return ["announcement:write"]

    def get_queryset(self):
        return Announcement.all_objects.filter(
            org_id=self.request.user.org_id,
            deleted_at__isnull=True,
        ).order_by("-pinned", "-published_at")

    def perform_create(self, serializer):
        serializer.save(org_id=self.request.user.org_id, created_by=self.request.user.id)
