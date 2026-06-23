"""Celery tasks — assignment due reminders + overdue notices."""

from __future__ import annotations

from datetime import date, timedelta

from celery import shared_task

from modules.employee.models import Employee
from modules.identity.models import User
from modules.notification.services.notify import notify

from .models import AssignmentRecipient


@shared_task
def assignment_reminders() -> int:
    """Notify recipients due tomorrow (reminder) or today (overdue). Returns count sent."""
    tomorrow = date.today() + timedelta(days=1)
    today = date.today()
    sent = 0
    rows = AssignmentRecipient.objects.filter(
        status="pending", due_date__in=[tomorrow, today]
    ).select_related("assignment")
    for r in rows:
        emp = Employee.all_objects.filter(id=r.employee_id).first()
        u = User.objects.filter(id=emp.user_id).first() if emp and emp.user_id else None
        if not u:
            continue
        kind = "assignment.reminder" if r.due_date == tomorrow else "assignment.overdue"
        notify(
            user=u,
            type=kind,
            payload={"title": r.assignment.title, "due": str(r.due_date)},
            deep_link="/action-center",
        )
        sent += 1
    return sent
