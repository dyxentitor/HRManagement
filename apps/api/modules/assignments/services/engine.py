"""Assignment engine — target resolution, manager scoping, publish, complete."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from common.audit.service import append as audit_append
from modules.employee.models import Employee
from modules.identity.models import User
from modules.notification.services.notify import notify

from ..models import Assignment, AssignmentRecipient


def manager_report_ids(manager_user_id, org_id) -> set:
    """Direct-report employee ids for the manager (by Employee.manager_id)."""
    mgr = Employee.all_objects.filter(
        user_id=manager_user_id, org_id=org_id, deleted_at__isnull=True
    ).first()
    if mgr is None:
        return set()
    return set(
        Employee.all_objects.filter(
            org_id=org_id, manager_id=mgr.id, deleted_at__isnull=True
        ).values_list("id", flat=True)
    )


def resolve_targets(org_id, kind: str, ids: list) -> list:
    qs = Employee.all_objects.filter(org_id=org_id, deleted_at__isnull=True)
    if kind == "employee":
        return list(qs.filter(id__in=ids).values_list("id", flat=True))
    if kind == "team":
        return list(qs.filter(team_id__in=ids).values_list("id", flat=True))
    if kind == "department":
        return list(qs.filter(department_id__in=ids).values_list("id", flat=True))
    if kind == "org":
        return list(qs.values_list("id", flat=True))
    return []


@transaction.atomic
def publish(assignment: Assignment, *, target_employee_ids: list, actor_id) -> int:
    """Mark published, fan out recipients (idempotent), notify, audit."""
    assignment.status = "published"
    assignment.save(update_fields=["status", "updated_at"])
    existing = set(
        AssignmentRecipient.objects.filter(assignment=assignment).values_list(
            "employee_id", flat=True
        )
    )
    rows = [
        AssignmentRecipient(
            org_id=assignment.org_id,
            assignment=assignment,
            employee_id=eid,
            due_date=assignment.default_due_date,
        )
        for eid in dict.fromkeys(target_employee_ids)  # dedupe, keep order
        if eid not in existing
    ]
    AssignmentRecipient.objects.bulk_create(rows)
    audit_append(
        org_id=assignment.org_id,
        action="assignment.published",
        entity="assignment",
        entity_id=assignment.id,
        actor_id=actor_id,
        after={"title": assignment.title, "recipients": len(rows)},
    )
    for r in rows:
        emp = Employee.all_objects.filter(id=r.employee_id).first()
        if not (emp and emp.user_id):
            continue
        u = User.objects.filter(id=emp.user_id).first()
        if u:
            notify(
                user=u,
                type="assignment.assigned",
                payload={
                    "title": assignment.title,
                    "due": str(assignment.default_due_date or ""),
                },
                deep_link="/action-center",
            )
    return len(rows)


def complete(recipient: AssignmentRecipient, *, ip: str, note: str = "") -> AssignmentRecipient:
    recipient.status = "completed"
    recipient.completed_at = timezone.now()
    recipient.completed_ip = (ip or "")[:64]
    recipient.note = (note or "")[:500]
    recipient.save(update_fields=["status", "completed_at", "completed_ip", "note"])
    audit_append(
        org_id=recipient.org_id,
        action="assignment.completed",
        entity="assignment_recipient",
        entity_id=recipient.id,
        after={
            "assignment_id": str(recipient.assignment_id),
            "employee_id": str(recipient.employee_id),
        },
    )
    return recipient
