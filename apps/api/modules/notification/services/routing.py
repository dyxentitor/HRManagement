"""Notification routing — org-level gates, delivery lanes, and CC resolution."""

from __future__ import annotations

import logging

from ..models import NotificationRouting

logger = logging.getLogger(__name__)


def routing_for(org_id, type_code: str) -> NotificationRouting:
    """The stored routing row, or an unsaved instance carrying the defaults.

    Never returns None and never writes. Both kill-switches default open — the
    registry's `*_default` flags govern personal preferences, not this gate.
    """
    row = NotificationRouting.objects.filter(org_id=org_id, type=type_code).first()
    if row is not None:
        return row
    return NotificationRouting(org_id=org_id, type=type_code)
