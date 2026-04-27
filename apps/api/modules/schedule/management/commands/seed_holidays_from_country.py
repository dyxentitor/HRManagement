"""Sync this year's holidays into an org from country_holidays reference."""

import datetime
import uuid

from django.core.management.base import BaseCommand, CommandError

from modules.organization.models import Organization
from modules.schedule.services.holiday import HolidayService


class Command(BaseCommand):
    help = "Sync country holidays into an org's Holiday table for the given year."

    def add_arguments(self, parser):
        parser.add_argument("--org-id", required=True)
        parser.add_argument("--year", type=int, default=None)

    def handle(self, *args, **options):
        try:
            org = Organization.objects.get(id=uuid.UUID(options["org_id"]))
        except (Organization.DoesNotExist, ValueError) as exc:
            raise CommandError(f"Org not found: {options['org_id']}") from exc

        year = options["year"] or datetime.date.today().year
        n = HolidayService.sync_from_country(org=org, year=year)
        self.stdout.write(self.style.SUCCESS(f"Synced {n} holidays for {org.slug} in {year}."))
