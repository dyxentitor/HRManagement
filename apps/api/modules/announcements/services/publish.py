"""Publish / archive an announcement, fanning out notifications at publish time."""

from __future__ import annotations

import logging

from django.utils import timezone

from modules.notification.services.notify import notify

from .audience import resolve_audience

logger = logging.getLogger(__name__)


def publish(announcement, *, actor_id=None):
    """Move an announcement to published + notify its audience. Idempotent."""
    if announcement.status in ("published", "archived"):
        return announcement
    announcement.status = "published"
    if announcement.published_at is None:
        announcement.published_at = timezone.now()
    announcement.save(update_fields=["status", "published_at", "updated_at"])
    try:
        for user in resolve_audience(
            announcement.org_id, announcement.audience_type, announcement.audience_spec
        ):
            notify(
                user=user,
                type="announcement.published",
                payload={
                    "announcement_id": str(announcement.id),
                    "title": announcement.title,
                    "category": announcement.category,
                },
                deep_link=f"/announcements/{announcement.id}",
                priority=announcement.priority,
            )
    except Exception:
        logger.exception("Failed to fan out announcement.published for %s", announcement.id)
    return announcement


def archive(announcement):
    announcement.status = "archived"
    announcement.save(update_fields=["status", "updated_at"])
    return announcement
