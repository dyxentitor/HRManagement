"""Idempotent backfill: set resignation_date from deleted_at for resigned employees.

resignation_date is the source of truth for "resigned this month" on the dashboard.
Legacy rows only flipped status->resigned without a date; use deleted_at.date() as a
documented proxy. Add-only — never overwrites an existing resignation_date.

Usage:
    python manage.py backfill_resignation_dates
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from modules.employee.models import Employee


class Command(BaseCommand):
    help = "Backfill Employee.resignation_date from deleted_at where status=resigned."

    def handle(self, *args, **options) -> None:
        qs = Employee.all_objects.filter(status="resigned", resignation_date__isnull=True)
        n = 0
        for emp in qs:
            if emp.deleted_at:
                emp.resignation_date = emp.deleted_at.date()
                emp.save(update_fields=["resignation_date"])
                n += 1
        self.stdout.write(self.style.SUCCESS(f"Backfilled {n} resignation_date(s)."))
