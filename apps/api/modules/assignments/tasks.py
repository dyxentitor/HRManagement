"""Celery tasks — assignment due reminders + overdue notices."""

from __future__ import annotations

from datetime import date, timedelta

from celery import shared_task

from modules.employee.models import Employee
from modules.identity.models import User
from modules.notification.services.notify import notify

from .models import Assignment, AssignmentRecipient
from .services import engine


@shared_task
def assignment_reminders() -> int:
    """Notify recipients due tomorrow (reminder) or today (overdue). Returns count sent."""
    tomorrow = date.today() + timedelta(days=1)
    today = date.today()
    sent = 0
    rows = (
        AssignmentRecipient.objects.filter(status="pending", due_date__in=[tomorrow, today])
        .exclude(last_reminded_on=today)
        .select_related("assignment")
    )
    for r in rows:
        emp = Employee.all_objects.filter(id=r.employee_id).first()
        u = User.objects.filter(id=emp.user_id).first() if emp and emp.user_id else None
        if not u:
            continue
        is_reminder = r.due_date == tomorrow
        kind = "assignment.reminder" if is_reminder else "assignment.overdue"
        notify(
            user=u,
            type=kind,
            payload={"title": r.assignment.title, "due": str(r.due_date)},
            deep_link="/action-center",
            priority="high" if is_reminder else "urgent",
        )
        sent += 1
        r.last_reminded_on = today
        r.save(update_fields=["last_reminded_on"])
    return sent


@shared_task
def spawn_recurring_assignments() -> int:
    """Spawn the next occurrence of each due recurring template. Returns count spawned."""
    today = date.today()
    spawned = 0
    templates = Assignment.objects.filter(
        is_template=True,
        recurrence__in=["daily", "weekly", "monthly", "yearly"],
        next_run_at__lte=today,
    )
    for t in templates:
        if t.recurrence_until and t.next_run_at > t.recurrence_until:
            continue
        engine.spawn_instance(t)
        t.next_run_at = engine.advance_date(t.next_run_at, t.recurrence, t.recurrence_interval)
        t.save(update_fields=["next_run_at"])
        spawned += 1
    return spawned
