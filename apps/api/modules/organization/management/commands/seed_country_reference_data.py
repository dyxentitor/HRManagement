"""Idempotent loader for per-country reference data.

Usage:
    python manage.py seed_country_reference_data --country MY
"""

from pathlib import Path

import yaml
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from modules.organization.models import (
    Country,
    CountryHoliday,
    CountryLeaveTypeDefault,
)


class Command(BaseCommand):
    help = "Load country reference data (countries, holidays, leave-type defaults) idempotently."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--country",
            required=True,
            help="ISO 3166-1 alpha-2 country code (e.g., MY).",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        code = options["country"].upper()
        fixture_path = (
            Path(__file__).resolve().parent.parent.parent
            / "fixtures"
            / f"countries_{code.lower()}.yaml"
        )
        if not fixture_path.exists():
            raise CommandError(f"No fixture for country {code} at {fixture_path}")

        with fixture_path.open() as f:
            entries = yaml.safe_load(f)

        n_countries = n_holidays = n_leavetypes = 0

        for entry in entries:
            model = entry["model"]
            fields = entry["fields"]

            if model == "organization.country":
                Country.objects.update_or_create(code=entry["pk"], defaults=fields)
                n_countries += 1
            elif model == "organization.countryholiday":
                CountryHoliday.objects.update_or_create(
                    country_code=fields["country_code"],
                    date=fields["date"],
                    name=fields["name"],
                    defaults={
                        "type": fields["type"],
                        "state_code": fields.get("state_code"),
                    },
                )
                n_holidays += 1
            elif model == "organization.countryleavetypedefault":
                CountryLeaveTypeDefault.objects.update_or_create(
                    country_code=fields["country_code"],
                    code=fields["code"],
                    defaults={
                        "name": fields["name"],
                        "default_days": fields["default_days"],
                        "statutory": fields["statutory"],
                        "accrual_type": fields["accrual_type"],
                    },
                )
                n_leavetypes += 1

        msg = (
            f"Seeded {code}: {n_countries} country, "
            f"{n_holidays} holidays, {n_leavetypes} leave types."
        )
        self.stdout.write(self.style.SUCCESS(msg))
