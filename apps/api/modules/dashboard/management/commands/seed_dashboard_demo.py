"""Idempotent demo data so the command-center dashboard looks alive.

Adds a few announcements, an active payroll period, an open payroll exception,
and onboarding checklists for the demo org. Safe to run repeatedly
(get_or_create). No-op when the org / employees are absent.

Usage:
    python manage.py seed_dashboard_demo            # first org
    python manage.py seed_dashboard_demo --org-slug provintell
"""

from __future__ import annotations

import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from modules.announcements.models import Announcement
from modules.employee.models import Employee
from modules.onboarding.models import DEFAULT_ITEMS, OnboardingChecklist, OnboardingItem
from modules.organization.models import Organization
from modules.payslip.models import PayrollException, PayrollPeriod

ANNOUNCEMENTS = [
    (
        "New leave policy 2026 is live",
        "Annual entitlement now scales 8 to 16 days with tenure. Carry-forward is "
        "capped at 5 days. Effective 1 July 2026.",
        "policy",
        True,
    ),
    (
        "Scheduled system maintenance — Saturday 02:00",
        "The HR portal will be briefly unavailable on Saturday between 02:00 and "
        "04:00 for planned maintenance.",
        "maintenance",
        False,
    ),
    (
        "Q2 Town Hall — Friday 4:00pm",
        "Join the quarterly town hall in the main auditorium or via livestream. "
        "Q2 results and the H2 roadmap will be shared.",
        "event",
        False,
    ),
    (
        "Cybersecurity awareness training — enrol now",
        "Annual security awareness training is open. Please complete it before 30 June.",
        "general",
        False,
    ),
]


class Command(BaseCommand):
    help = "Seed idempotent demo data for the operational dashboard."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--org-slug", required=False, help="Org slug (default: first org).")

    def handle(self, *args, **options) -> None:
        slug = options.get("org_slug")
        org = (
            Organization.objects.filter(slug=slug).first()
            if slug
            else Organization.objects.order_by("created_at").first()
        )
        if org is None:
            self.stdout.write(self.style.WARNING("No organization found — nothing to seed."))
            return

        today = timezone.localdate()

        # Announcements.
        n_ann = 0
        for title, body, category, pinned in ANNOUNCEMENTS:
            _, created = Announcement.all_objects.get_or_create(
                org_id=org.id,
                title=title,
                defaults={"body": body, "category": category, "pinned": pinned},
            )
            n_ann += int(created)

        # Active payroll period for the current month (status: ready).
        first = today.replace(day=1)
        period, _ = PayrollPeriod.all_objects.get_or_create(
            org_id=org.id,
            period_start=first,
            period_end=(first + datetime.timedelta(days=31)).replace(day=1)
            - datetime.timedelta(days=1),
            defaults={
                "period_type": "monthly",
                "pay_date": first + datetime.timedelta(days=27),
                "status": "ready",
            },
        )

        # One open payroll exception.
        PayrollException.all_objects.get_or_create(
            org_id=org.id,
            period=period,
            kind="missing_bank",
            defaults={"message": "Employee has no bank account on file.", "status": "open"},
        )

        # Onboarding checklists for the two most-recent hires.
        n_onb = 0
        recent = Employee.all_objects.filter(org_id=org.id, deleted_at__isnull=True).order_by(
            "-hire_date"
        )[:2]
        for emp in recent:
            checklist, created = OnboardingChecklist.all_objects.get_or_create(
                org_id=org.id, employee_id=emp.id, defaults={"status": "in_progress"}
            )
            if created:
                n_onb += 1
                for order, label in enumerate(DEFAULT_ITEMS):
                    OnboardingItem.all_objects.create(
                        org_id=org.id, checklist=checklist, label=label, order=order
                    )

        self.stdout.write(
            self.style.SUCCESS(
                f"Dashboard demo seeded for '{org.slug}': "
                f"{n_ann} new announcement(s), payroll period {period.status}, "
                f"{n_onb} new onboarding checklist(s)."
            )
        )
