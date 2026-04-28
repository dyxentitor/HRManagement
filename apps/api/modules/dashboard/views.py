"""Dashboard module views — inbox + dashboard endpoints."""

from __future__ import annotations

from typing import ClassVar

from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.identity.permissions import HRMSPermission
from modules.identity.services.permissions import get_user_perms

from .services.inbox import get_inbox


class ApprovalsInboxView(APIView):
    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list[str]] = ["approvals:inbox:read"]

    def get(self, request):
        items = get_inbox(user=request.user)
        return Response([i.to_dict() for i in items])


class DashboardView(APIView):
    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list[str]] = []  # variant-specific check done in get()

    def get(self, request, variant: str):
        from .services.cards import CARD_TYPES
        from .services.role_filter import DASHBOARD_CARDS

        if variant not in DASHBOARD_CARDS:
            raise NotFound(f"Unknown dashboard variant: {variant}")

        if f"dashboard:read:{variant}" not in get_user_perms(request.user):
            raise PermissionDenied()

        cards = []
        for type_code in DASHBOARD_CARDS[variant]:
            cls = CARD_TYPES.get(type_code)
            if cls is None or not cls.is_visible_for(request.user):
                continue
            cards.append(cls.fetch(request.user))
        return Response({"variant": variant, "cards": cards})
