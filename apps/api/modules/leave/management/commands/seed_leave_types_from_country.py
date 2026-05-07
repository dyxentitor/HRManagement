"""Seed LeaveTypes (+ default LeavePolicy with tenure brackets) for an org."""

import uuid
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from modules.leave.models import LeavePolicy, LeaveType
from modules.organization.models import (
    CountryLeaveTypeDefault,
    Organization,
)

# Per-leave-type statute-level defaults (applied at seed time only).
# Keyed by code; missing codes get defaults (zeros / nulls / "any").
_STATUTE_DEFAULTS = {
    "ANNUAL": {
        "carry_forward_max": Decimal("5"),
        "carry_forward_expiry_months": 12,
    },
    "MEDICAL": {
        "carry_forward_max": Decimal("0"),  # use-it-or-lose-it
    },
    "HOSPITALIZATION": {
        "carry_forward_max": Decimal("0"),
    },
    "MATERNITY": {
        "max_per_lifetime_events": 5,
        "gender_restriction": "female",
    },
    "PATERNITY": {
        "requires_service_months": 12,
        "notice_days_required": 30,
        "max_per_lifetime_events": 5,
        "gender_restriction": "male",
    },
}


class Command(BaseCommand):
    help = "Seed LeaveTypes (+ default LeavePolicy with tenure brackets) for an org."

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
        n_policies = 0
        today = timezone.localdate()

        for d in defaults:
            statute = _STATUTE_DEFAULTS.get(d.code, {})
            type_defaults = {
                "name": d.name,
                "default_days": d.default_days,
                "accrual_type": d.accrual_type,
                "is_paid": True,
                "is_statutory": d.statutory,
                "gender_restriction": statute.get("gender_restriction", "any"),
                "carry_forward_max": statute.get("carry_forward_max", Decimal("0")),
                "carry_forward_expiry_months": statute.get("carry_forward_expiry_months"),
                "requires_service_months": statute.get("requires_service_months", 0),
                "notice_days_required": statute.get("notice_days_required", 0),
                "max_per_lifetime_events": statute.get("max_per_lifetime_events"),
            }
            lt, created = LeaveType.all_objects.update_or_create(
                org_id=org.id,
                code=d.code,
                defaults=type_defaults,
            )
            n_created += int(created)
            n_updated += int(not created)

            # Default org-wide policy when the country fixture has tenure_brackets.
            brackets = list(d.tenure_brackets or [])
            if brackets:
                _, pol_created = LeavePolicy.all_objects.update_or_create(
                    org_id=org.id,
                    leave_type=lt,
                    applies_to_role_id=None,
                    applies_to_department_id=None,
                    defaults={
                        "days_per_year": Decimal(str(brackets[0]["days"])),
                        "tenure_brackets": brackets,
                        "effective_from": today,
                        "effective_to": None,
                    },
                )
                if pol_created:
                    n_policies += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded leave types for org={org.slug}: "
                f"{n_created} created, {n_updated} updated, {n_policies} new policies."
            )
        )
