"""Hourly SMTP health-check: alert org_admins in-app when email delivery is down."""

from __future__ import annotations

import logging

from common.mail.models import EmailConfiguration
from common.mail.service import run_connection_test
from modules.notification.services.notify import notify
from modules.notification.services.recipients import role_users

logger = logging.getLogger(__name__)


def _was_healthy(cfg: EmailConfiguration) -> bool:
    if cfg.last_failure_at is None:
        return True
    if cfg.last_success_at is None:
        return False
    return cfg.last_success_at >= cfg.last_failure_at


def check_email_health() -> dict:
    results = {"checked": 0, "failed": 0, "alerted": 0}
    for cfg in EmailConfiguration.objects.all():
        was_healthy = _was_healthy(cfg)  # read BEFORE the test rewrites health fields
        res = run_connection_test(cfg.org_id, {})
        results["checked"] += 1
        if res.get("success"):
            continue
        results["failed"] += 1
        if not was_healthy:
            continue  # already down — don't re-spam
        logger.error(
            "Email delivery health check FAILED for org %s: %s",
            cfg.org_id,
            res.get("detail"),
        )
        for admin in role_users(cfg.org_id, "org_admin"):
            notify(
                user=admin,
                type="system.email_delivery_failed",
                payload={"detail": (res.get("detail") or "")[:200]},
                deep_link="/admin/settings",
                priority="urgent",
            )
        results["alerted"] += 1
    return results
