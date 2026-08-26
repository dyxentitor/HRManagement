"""Import provider holidays into the global reference, then optionally into orgs.

Country-neutral. Examples::

    python manage.py sync_country_holidays --country MY --subdivision MY-10 --year 2027 --dry-run
    python manage.py sync_country_holidays --country SG --year 2027 --apply
    python manage.py sync_country_holidays --country MY --year 2027 --apply --sync-orgs

Defaults to dry-run: `--apply` is required to write.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from common.holidays import (
    DEFAULT_PROVIDER,
    InvalidJurisdictionError,
    ProviderNotAvailableError,
    UnknownProviderError,
    available_providers,
)
from modules.organization.holiday_import import import_country_holidays
from modules.organization.models import Organization
from modules.schedule.services.holiday import reconcile_org_holidays

COUNTS = ("added", "updated", "unchanged", "withdrawn", "skipped", "conflicted")


class Command(BaseCommand):
    help = "Sync a country's holidays from a provider into the local reference table."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--country", required=True, help="ISO 3166-1 alpha-2, e.g. MY")
        parser.add_argument("--subdivision", default=None, help="ISO 3166-2, e.g. MY-10 (optional)")
        parser.add_argument("--year", type=int, required=True)
        parser.add_argument(
            "--provider",
            default=DEFAULT_PROVIDER,
            help=f"One of: {', '.join(available_providers())}",
        )
        parser.add_argument("--language", default="en_US", help="Display language, if supported")
        parser.add_argument(
            "--no-observed",
            action="store_true",
            help="Exclude observed/substitute days.",
        )
        parser.add_argument(
            "--sync-orgs",
            action="store_true",
            help="Also reconcile matching organizations' effective holiday lists.",
        )
        group = parser.add_mutually_exclusive_group()
        group.add_argument("--dry-run", action="store_true", help="Preview only (default).")
        group.add_argument("--apply", action="store_true", help="Persist changes.")

    def handle(self, *args, **options) -> None:
        dry_run = not options["apply"]
        country = options["country"]
        subdivision = options["subdivision"]
        year = options["year"]

        try:
            stats = import_country_holidays(
                country_code=country,
                year=year,
                subdivision_code=subdivision,
                provider_name=options["provider"],
                language=options["language"],
                include_observed=not options["no_observed"],
                dry_run=dry_run,
            )
        except (InvalidJurisdictionError, ProviderNotAvailableError, UnknownProviderError) as exc:
            raise CommandError(str(exc)) from exc

        scope = subdivision or country
        mode = "DRY-RUN" if dry_run else "APPLIED"
        self.stdout.write(
            self.style.MIGRATE_HEADING(
                f"[{mode}] reference {scope} {year} via {options['provider']}"
            )
        )
        self._render(stats)

        if options["sync_orgs"]:
            self._sync_orgs(country, subdivision, year, dry_run)

        if dry_run:
            self.stdout.write(self.style.WARNING("Nothing written. Re-run with --apply."))

    def _sync_orgs(self, country: str, subdivision: str | None, year: int, dry_run: bool) -> None:
        orgs = Organization.objects.filter(country_code=country.upper(), status="active")
        if not orgs:
            self.stdout.write(self.style.WARNING(f"No active orgs with country_code={country}."))
            return
        for org in orgs:
            stats = reconcile_org_holidays(
                org=org,
                year=year,
                subdivision_code=subdivision or org.default_subdivision_code or None,
                dry_run=dry_run,
            )
            self.stdout.write(self.style.MIGRATE_HEADING(f"  org {org.slug}"))
            self._render(stats, indent="  ")

    def _render(self, stats, indent: str = "") -> None:
        counts = stats.as_dict()
        summary = "  ".join(f"{name}={counts[name]}" for name in COUNTS)
        self.stdout.write(f"{indent}{summary}")
        for line in stats.changes:
            self.stdout.write(f"{indent}  {line}")
        for line in stats.conflicts:
            self.stdout.write(self.style.WARNING(f"{indent}  ! {line}"))
