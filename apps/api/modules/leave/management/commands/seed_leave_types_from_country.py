"""Seed LeaveTypes for an org from country_leave_type_defaults reference data."""

import uuid

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from modules.leave.models import LeaveType
from modules.organization.models import (
    CountryLeaveTypeDefault,
    Organization,
)


class Command(BaseCommand):
    help = "Seed LeaveTypes for an org from country_leave_type_defaults."

    def add_arguments(self, parser):
        parser.add_argument("--org-id", required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            org = Organization.objects.get(id=uuid.UUID(options["org_id"]))
        except (Organization.DoesNotExist, ValueError) as exc:
            raise CommandError(f"Org not found: {options['org_id']}") from exc

        defaults = CountryLeaveTypeDefault.objects.filter(country_code=org.country_code)
        if not defaults.exists():
            raise CommandError(
                f"No CountryLeaveTypeDefault rows for country={org.country_code}. "
                f"Run `seed_country_reference_data --country {org.country_code}` first."
            )

        n_created = 0
        n_updated = 0
        for d in defaults:
            _obj, created = LeaveType.all_objects.update_or_create(
                org_id=org.id,
                code=d.code,
                defaults={
                    "name": d.name,
                    "default_days": d.default_days,
                    "accrual_type": d.accrual_type,
                    "is_paid": True,
                    "is_statutory": d.statutory,
                    "gender_restriction": (
                        "female"
                        if d.code == "MATERNITY"
                        else "male"
                        if d.code == "PATERNITY"
                        else "any"
                    ),
                },
            )
            n_created += int(created)
            n_updated += int(not created)

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded leave types for org={org.slug}: "
                f"{n_created} created, {n_updated} updated."
            )
        )
