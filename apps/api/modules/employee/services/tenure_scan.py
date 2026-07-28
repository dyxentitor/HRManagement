"""Daily scan: employees whose probation/contract ends in 30 days → notify. Idempotent on flags."""

from __future__ import annotations

import datetime
import logging

from django.utils import timezone

from common.audit.service import append as audit_append
from modules.employee.models import Employee

logger = logging.getLogger(__name__)

_WINDOW_DAYS = 30


def scan_tenure_endings(*, org_id=None) -> dict[str, int]:
    today = timezone.localdate()
    threshold = today + datetime.timedelta(days=_WINDOW_DAYS)
    counts = {"probation": 0, "contract": 0}

    specs = [
        ("probation", "probation_end_date", "probation_alert_sent",
         "employee.probation_ending_soon", "employee.probation_alert"),
        ("contract", "contract_end_date", "contract_alert_sent",
         "employee.contract_ending_soon", "employee.contract_alert"),
    ]
    for key, date_field, flag_field, notif_type, audit_action in specs:
        qs = Employee.all_objects.filter(
            deleted_at__isnull=True, **{date_field: threshold, flag_field: False}
        )
        if org_id is not None:
            qs = qs.filter(org_id=org_id)
        for emp in qs.select_related("manager"):
            _notify_tenure(emp, notif_type=notif_type)
            setattr(emp, flag_field, True)
            emp.save(update_fields=[flag_field, "updated_at"])
            audit_append(
                org_id=emp.org_id, action=audit_action, entity="employees",
                entity_id=emp.id, after={"date": str(getattr(emp, date_field))},
            )
            counts[key] += 1
    return counts


def _notify_tenure(emp: Employee, *, notif_type: str) -> None:
    try:
        from modules.notification.services.notify import notify
        from modules.notification.services.recipients import hr_manager_users

        recipients = {u.id: u for u in hr_manager_users(emp.org_id)}
        mgr_user = getattr(getattr(emp, "manager", None), "user", None)
        if mgr_user is not None:
            recipients[mgr_user.id] = mgr_user

        payload = {
            "employee_id": str(emp.id),
            "employee_code": emp.employee_code,
            "name": f"{emp.first_name} {emp.last_name}".strip(),
        }
        for user in recipients.values():
            notify(
                user=user, type=notif_type, payload=payload,
                deep_link=f"/employees/{emp.id}", priority="high",
            )
    except Exception:
        logger.exception("Failed to send tenure alert for employee %s", emp.id)
