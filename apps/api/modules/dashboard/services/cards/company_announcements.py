"""CompanyAnnouncements card — pinned + recent non-expired announcements."""

from __future__ import annotations

from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card


class CompanyAnnouncements(Card):
    type: ClassVar[str] = "company_announcements"
    requires_perms: ClassVar[list[str]] = ["announcement:read"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from django.db.models import Q
        from django.utils import timezone

        from modules.announcements.models import Announcement

        now = timezone.now()
        rows = (
            Announcement.all_objects.filter(org_id=user.org_id, deleted_at__isnull=True)
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gte=now))
            .order_by("-pinned", "-published_at")[:6]
        )

        return {
            "type": cls.type,
            "title": "Company announcements",
            "data": {
                "items": [
                    {
                        "id": str(a.id),
                        "title": a.title,
                        "category": a.category,
                        "pinned": a.pinned,
                        "published_at": a.published_at.isoformat(),
                    }
                    for a in rows
                ],
            },
        }
