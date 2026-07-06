"""Assignment engine — target resolution, manager scoping, publish, complete, recurrence."""

from __future__ import annotations

import calendar
import datetime as dt

from django.db import transaction
from django.utils import timezone

from common.audit.service import append as audit_append
from modules.employee.models import Employee
from modules.identity.models import User
from modules.notification.services.notify import notify

from ..models import Assignment, AssignmentQuestion, AssignmentRecipient


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
                priority="high",
            )
    return len(rows)


def fire_trigger(org_id, employee_id, trigger_key: str, *, ip: str = "") -> int:
    """Auto-complete an employee's pending recipients whose assignment listens for this trigger."""
    if not trigger_key or trigger_key == "manual":
        return 0
    rows = AssignmentRecipient.objects.filter(
        org_id=org_id,
        employee_id=employee_id,
        status="pending",
        assignment__complete_on=trigger_key,
    )
    n = 0
    for r in rows:
        complete(r, ip=ip, note=f"auto:{trigger_key}")
        n += 1
    return n


def advance_date(d: dt.date, recurrence: str, interval: int) -> dt.date:
    """Next occurrence date for a cadence (month/year arithmetic clamps the day)."""
    interval = max(1, interval)
    if recurrence == "daily":
        return d + dt.timedelta(days=interval)
    if recurrence == "weekly":
        return d + dt.timedelta(weeks=interval)
    if recurrence == "monthly":
        month = d.month - 1 + interval
        year = d.year + month // 12
        month = month % 12 + 1
        day = min(d.day, calendar.monthrange(year, month)[1])
        return dt.date(year, month, day)
    if recurrence == "yearly":
        try:
            return d.replace(year=d.year + interval)
        except ValueError:  # Feb 29 → Feb 28
            return d.replace(year=d.year + interval, day=28)
    return d


@transaction.atomic
def spawn_instance(template: Assignment) -> Assignment:
    """Clone a recurring template into a fresh published instance for this period."""
    inst = Assignment.objects.create(
        org_id=template.org_id,
        title=template.title,
        description=template.description,
        type=template.type,
        link_url=template.link_url,
        link_target=template.link_target,
        default_due_date=template.default_due_date,
        created_by=template.created_by,
        parent=template,
        recurrence="none",
        is_template=False,
    )
    for q in template.questions.all():
        AssignmentQuestion.objects.create(
            org_id=inst.org_id,
            assignment=inst,
            order=q.order,
            text=q.text,
            qtype=q.qtype,
            options=q.options,
            required=q.required,
        )
    spec = template.target_spec or {}
    targets = resolve_targets(template.org_id, spec.get("kind", ""), spec.get("ids") or [])
    publish(inst, target_employee_ids=targets, actor_id=template.created_by)
    return inst


def complete(
    recipient: AssignmentRecipient, *, ip: str, note: str = "", evidence_s3_key: str = ""
) -> AssignmentRecipient:
    recipient.status = "completed"
    recipient.completed_at = timezone.now()
    recipient.completed_ip = (ip or "")[:64]
    recipient.note = (note or "")[:500]
    if evidence_s3_key:
        recipient.evidence_s3_key = evidence_s3_key[:500]
    recipient.acked_version = recipient.assignment.version
    recipient.save(
        update_fields=[
            "status",
            "completed_at",
            "completed_ip",
            "note",
            "evidence_s3_key",
            "acked_version",
        ]
    )
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


@transaction.atomic
def revise(assignment: Assignment, *, actor_id) -> int:
    """Bump the version and reopen completed recipients so they re-acknowledge."""
    assignment.version += 1
    assignment.save(update_fields=["version", "updated_at"])
    reopened = assignment.recipients.filter(status="completed")
    n = reopened.count()
    reopened.update(status="pending", completed_at=None)
    audit_append(
        org_id=assignment.org_id,
        action="assignment.revised",
        entity="assignment",
        entity_id=assignment.id,
        actor_id=actor_id,
        after={"version": assignment.version, "reopened": n},
    )
    return n


def evidence_upload_url(assignment_id, employee_id, content_type: str) -> tuple[str, str]:
    """Presigned PUT url + key for uploading completion evidence."""
    import uuid as _uuid

    from common.storage.s3 import bucket, public_s3_client

    key = f"assignments/{assignment_id}/{employee_id}/{_uuid.uuid4().hex}"
    url = public_s3_client().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": bucket(),
            "Key": key,
            "ContentType": content_type or "application/octet-stream",
        },
        ExpiresIn=300,
    )
    return url, key
