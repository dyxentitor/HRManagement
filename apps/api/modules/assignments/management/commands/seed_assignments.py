"""Seed demo assignments covering every type + state (idempotent).

    python manage.py seed_assignments [--org-id <uuid>]

Re-running skips assignments whose title already exists in the org, so it's safe to run
repeatedly. Targets all active employees in the org so every demo login sees a rich
Action Center, and HR sees populated tracking + analytics.
"""

from __future__ import annotations

import datetime as dt

from django.core.management.base import BaseCommand
from django.utils import timezone

from modules.assignments.models import (
    Assignment,
    AssignmentQuestion,
    AssignmentRecipient,
    AssignmentResponse,
)
from modules.assignments.services import engine
from modules.employee.models import Employee
from modules.identity.models import User, UserRole
from modules.organization.models import Organization

TODAY = dt.date.today


class Command(BaseCommand):
    help = "Seed demo assignments covering all types/states (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--org-id", default=None, help="Limit to one org (default: all).")

    def handle(self, *args, **opts):
        orgs = (
            Organization.objects.filter(id=opts["org_id"])
            if opts["org_id"]
            else Organization.objects.all()
        )
        for org in orgs:
            self._seed_org(org)

    # ------------------------------------------------------------------ helpers
    def _admin_id(self, org):
        uid = (
            UserRole.objects.filter(role__org_id=org.id, role__code="org_admin")
            .values_list("user_id", flat=True)
            .first()
        )
        return uid or User.objects.filter(org_id=org.id).values_list("id", flat=True).first()

    def _mark_done(self, assignment, employee_ids, *, note="Demo: completed"):
        rows = AssignmentRecipient.objects.filter(
            assignment=assignment, employee_id__in=employee_ids
        )
        for r in rows:
            r.status = "completed"
            r.completed_at = timezone.now()
            r.note = note
            r.acked_version = assignment.version
            r.save(update_fields=["status", "completed_at", "note", "acked_version"])
        return list(rows)

    # ------------------------------------------------------------------- per-org
    def _seed_org(self, org):
        emps = list(
            Employee.all_objects.filter(org_id=org.id, deleted_at__isnull=True).order_by(
                "employee_code"
            )
        )
        if not emps:
            self.stdout.write(f"  {org.slug}: no employees, skipped")
            return
        emp_ids = [e.id for e in emps]
        actor = self._admin_id(org)
        created = 0

        def have(title):
            return Assignment.objects.filter(org_id=org.id, title=title).exists()

        def task(**kw):
            nonlocal created
            if have(kw["title"]):
                return None
            a = Assignment.objects.create(org_id=org.id, created_by=actor, **kw)
            engine.publish(a, target_employee_ids=emp_ids, actor_id=actor)
            created += 1
            return a

        # 1) Task with internal link — due soon
        task(
            title="Complete your profile",
            description="Fill in the remaining fields on your employee profile.",
            type="task",
            link_url="/me/profile",
            link_target="internal",
            default_due_date=TODAY() + dt.timedelta(days=5),
        )

        # 2) Acknowledge (policy) — external link, a few already done
        ack = task(
            title="Acknowledge the 2026 Code of Conduct",
            description="Please read the updated policy and acknowledge.",
            type="acknowledge",
            link_url="https://example.com/code-of-conduct-2026.pdf",
            link_target="external",
            default_due_date=TODAY() + dt.timedelta(days=10),
        )
        if ack:
            self._mark_done(ack, emp_ids[: max(1, len(emp_ids) // 2)], note="Demo: acknowledged")

        # 3) Overdue task — due in the past, still pending
        task(
            title="Submit your emergency contact",
            description="Add an emergency contact under your profile.",
            type="task",
            link_url="/me/profile",
            link_target="internal",
            default_due_date=TODAY() - dt.timedelta(days=3),
        )

        # 4) Evidence-required task
        task(
            title="Upload your signed NDA",
            description="Download, sign, and upload the NDA as proof.",
            type="task",
            requires_evidence=True,
            default_due_date=TODAY() + dt.timedelta(days=7),
        )

        # 5) Auto-complete task (fires when the profile hits 100%)
        task(
            title="Reach 100% profile completeness",
            description="Auto-completes once your profile is fully filled in.",
            type="task",
            link_url="/me/profile",
            link_target="internal",
            complete_on="profile_completed",
            default_due_date=TODAY() + dt.timedelta(days=14),
        )

        # 6) Questionnaire / poll — with questions + some responses
        if not have("Q2 Engagement Survey"):
            survey = Assignment.objects.create(
                org_id=org.id,
                created_by=actor,
                title="Q2 Engagement Survey",
                description="A few quick questions about how things are going.",
                type="questionnaire",
                default_due_date=TODAY() + dt.timedelta(days=12),
            )
            q1 = AssignmentQuestion.objects.create(
                org_id=org.id, assignment=survey, order=0, qtype="rating",
                text="How satisfied are you with your work-life balance?", required=True,
            )
            q2 = AssignmentQuestion.objects.create(
                org_id=org.id, assignment=survey, order=1, qtype="single_choice",
                text="How often do you work remotely?",
                options=["Never", "Sometimes", "Often", "Always"], required=True,
            )
            q3 = AssignmentQuestion.objects.create(
                org_id=org.id, assignment=survey, order=2, qtype="short_text",
                text="One thing we could improve?", required=False,
            )
            engine.publish(survey, target_employee_ids=emp_ids, actor_id=actor)
            # seed responses for the first third of recipients
            answers = [(q1, 4), (q2, "Sometimes"), (q3, "More team lunches")]
            third = emp_ids[: max(1, len(emp_ids) // 3)]
            for r in self._mark_done(survey, third, note="Demo: submitted"):
                for q, val in answers:
                    AssignmentResponse.objects.get_or_create(
                        recipient=r, question=q,
                        defaults={"org_id": org.id, "answer": {"value": val}},
                    )
            created += 1

        # 7) Recurring weekly template (+ first instance spawned now)
        if not have("Weekly timesheet check"):
            tmpl = Assignment.objects.create(
                org_id=org.id,
                created_by=actor,
                title="Weekly timesheet check",
                description="Confirm your hours for the week.",
                type="acknowledge",
                recurrence="weekly",
                recurrence_interval=1,
                is_template=True,
                target_spec={"kind": "employee", "ids": [str(i) for i in emp_ids]},
                next_run_at=TODAY() + dt.timedelta(days=7),
            )
            engine.spawn_instance(tmpl)
            created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"  {org.slug}: {created} assignment(s) created across {len(emps)} employees."
            )
        )
