"""Onboarding checklist viewset — perm-gated, with default-item seeding + toggle."""

from __future__ import annotations

from typing import ClassVar

from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from modules.identity.permissions import HRMSPermission

from .models import DEFAULT_ITEMS, OnboardingChecklist, OnboardingItem
from .serializers import OnboardingChecklistSerializer


class OnboardingChecklistViewSet(viewsets.ModelViewSet):
    """Employee onboarding checklists.

    Read gated on onboarding:read; create/toggle on onboarding:write.
    Creating a checklist seeds the DEFAULT_ITEMS template.
    """

    serializer_class = OnboardingChecklistSerializer
    permission_classes: ClassVar[list] = [HRMSPermission]

    @property
    def required_perms(self):
        if self.action in ("list", "retrieve"):
            return ["onboarding:read"]
        return ["onboarding:write"]

    def get_queryset(self):
        return (
            OnboardingChecklist.all_objects.filter(
                org_id=self.request.user.org_id,
                deleted_at__isnull=True,
            )
            .prefetch_related("items")
            .order_by("-started_at")
        )

    def perform_create(self, serializer):
        checklist = serializer.save(org_id=self.request.user.org_id)
        for order, label in enumerate(DEFAULT_ITEMS):
            OnboardingItem.all_objects.create(
                org_id=self.request.user.org_id,
                checklist=checklist,
                label=label,
                order=order,
            )

    @action(detail=True, methods=["patch"], url_path=r"items/(?P<item_id>[^/.]+)/toggle")
    def toggle_item(self, request, pk=None, item_id=None):
        checklist = self.get_object()
        item = OnboardingItem.all_objects.filter(
            id=item_id, checklist=checklist, deleted_at__isnull=True
        ).first()
        if item is None:
            raise NotFound("Item not found.")
        item.done = not item.done
        item.save(update_fields=["done", "updated_at"])

        # Recompute checklist completion.
        items = list(checklist.items.filter(deleted_at__isnull=True))
        all_done = bool(items) and all(i.done for i in items)
        if all_done and checklist.status != "completed":
            checklist.status = "completed"
            checklist.completed_at = timezone.now()
            checklist.save(update_fields=["status", "completed_at", "updated_at"])
        elif not all_done and checklist.status != "in_progress":
            checklist.status = "in_progress"
            checklist.completed_at = None
            checklist.save(update_fields=["status", "completed_at", "updated_at"])

        checklist.refresh_from_db()
        return Response(self.get_serializer(checklist).data)
