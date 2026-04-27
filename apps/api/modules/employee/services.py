"""Domain services for Employee. Wraps writes for audit + invariants."""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.mail import send_mail

from .models import Employee


class EmployeeService:
    @staticmethod
    def create(*, org_id, **fields: Any) -> Employee:
        return Employee.objects.create(org_id=org_id, **fields)

    @staticmethod
    def update(employee: Employee, **fields: Any) -> Employee:
        for k, v in fields.items():
            setattr(employee, k, v)
        # Auto-compute the *_last4 helpers when bank/IC fields change
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
        send_mail(
            subject=f"[HRMS] Bank info changed by {emp.email}",
            message=(
                f"Employee {emp.first_name} {emp.last_name} ({emp.employee_code}) "
                f"changed their bank info via self-service.\n\n"
                f"Bank: {emp.bank_name}\n"
                f"Last4: {emp.bank_account_last4}\n"
                f"Time: {emp.updated_at.isoformat()}"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=True,  # email failures must not block the API call
        )
