"""Domain services for Employee. Wraps writes for audit + invariants."""

from __future__ import annotations

from typing import Any

from django.conf import settings

from ..models import Employee


class EmployeeService:
    @staticmethod
    def create(*, org_id, **fields: Any) -> Employee:
        return Employee.objects.create(org_id=org_id, **fields)

    @staticmethod
    def update(employee: Employee, **fields: Any) -> Employee:
        for k, v in fields.items():
            setattr(employee, k, v)
        if fields.get("bank_account_number"):
            employee.bank_account_last4 = fields["bank_account_number"][-4:]
        if fields.get("ic_number"):
            employee.ic_last4 = fields["ic_number"][-4:]
        employee.save()
        return employee

    @staticmethod
    def notify_hr_of_bank_change(emp: Employee) -> None:
        """Email an HR-distribution alias whenever an employee changes their bank info.

        In M2 this is fire-and-forget via send_mail (uses MailHog in dev).
        """
        recipient = getattr(settings, "HR_NOTIFICATION_EMAIL", "hr@provintell.local")
        from common.mail import send as mail_send
        from common.mail.render import render_email

        ctx = {
            "name": f"{emp.first_name} {emp.last_name}",
            "employee_code": emp.employee_code,
            "bank_name": emp.bank_name or "",
            "last4": emp.bank_account_last4 or "",
            "email": emp.email,
            "timestamp": emp.updated_at.isoformat(),
        }
        subject, text, html = render_email("bank_changed", ctx, org_id=emp.org_id)
        mail_send(
            org_id=emp.org_id,
            subject=subject,
            body=text,
            html_body=html,
            to=[recipient],
            category="transactional",
            fail_silently=True,
        )

        # Also notify HR managers in-app (best-effort).
        try:
            from modules.notification.services.notify import notify
            from modules.notification.services.recipients import hr_manager_users

            for hr in hr_manager_users(emp.org_id):
                notify(
                    user=hr,
                    type="employee.bank_changed_self",
                    payload={
                        "employee_code": emp.employee_code,
                        "name": f"{emp.first_name} {emp.last_name}",
                    },
                    deep_link=f"/employees/{emp.id}",
                    priority="high",
                )
        except Exception:
            import logging

            logging.getLogger(__name__).exception(
                "Failed to send employee.bank_changed_self in-app notification"
            )
