"""Completion auto-detection (Phase 4).

The assignments app *listens* for real events from other modules via Django signals;
those modules never import assignments (one-way coupling). Receivers are best-effort —
a trigger failure must never break the host save.
"""

from __future__ import annotations

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from modules.employee.models import Employee
from modules.leave.models import LeaveRequest

from .services import engine

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Employee, dispatch_uid="assignments_profile_completed")
def _on_employee_saved(sender, instance, **kwargs):
    try:
        from modules.employee.services.completeness import profile_completeness

        if profile_completeness(instance).get("percent", 0) >= 100:
            engine.fire_trigger(instance.org_id, instance.id, "profile_completed")
    except Exception:
        logger.exception("assignment profile_completed trigger failed")


@receiver(post_save, sender=LeaveRequest, dispatch_uid="assignments_leave_requested")
def _on_leave_requested(sender, instance, created, **kwargs):
    if not created:
        return
    try:
        engine.fire_trigger(instance.org_id, instance.employee_id, "leave_requested")
    except Exception:
        logger.exception("assignment leave_requested trigger failed")
