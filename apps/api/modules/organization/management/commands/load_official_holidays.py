"""Load verified official government holiday corrections into the reference.

Country-neutral loader over `fixtures/official_holidays_<cc>.yaml`. Rows land
with `source="official"`, which outranks provider imports and the legacy
fixture. Usage::

    python manage.py load_official_holidays --country MY --dry-run
    python manage.py load_official_holidays --country MY --apply
"""

from __future__ import annotations

import datetime
from pathlib import Path

import yaml
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from common.holidays import InvalidJurisdictionError
from common.holidays.canonical import build_canonical_key
from common.holidays.iso import normalize_country_code, normalize_subdivision_code
from modules.organization.models import CountryHoliday

FIXTURE_DIR = Path(__file__).resolve().parent.parent.parent / "fixtures"


class Command(BaseCommand):
    help = "Load verified official holiday overrides for a country."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--country", required=True, help="ISO 3166-1 alpha-2, e.g. MY")
        group = parser.add_mutually_exclusive_group()
        group.add_argument("--dry-run", action="store_true", help="Preview only (default).")
        group.add_argument("--apply", action="store_true", help="Persist changes.")

    def handle(self, *args, **options) -> None:
        dry_run = not options["apply"]
        try:
            country = normalize_country_code(options["country"])
        except InvalidJurisdictionError as exc:
            raise CommandError(str(exc)) from exc

        path = FIXTURE_DIR / f"official_holidays_{country.lower()}.yaml"
        if not path.exists():
            raise CommandError(f"No official-override fixture for {country} at {path}")

        with path.open() as fh:
            payload = yaml.safe_load(fh) or {}
        entries = payload.get("holidays") or []

        added = updated = unchanged = 0
        with transaction.atomic():
            for entry in entries:
                added, updated, unchanged = self._upsert(entry, country, added, updated, unchanged)
            if dry_run:
                transaction.set_rollback(True)

        mode = "DRY-RUN" if dry_run else "APPLIED"
        self.stdout.write(
            self.style.SUCCESS(
                f"[{mode}] official {country}: added={added} updated={updated} "
                f"unchanged={unchanged} (from {len(entries)} entries)"
            )
        )
        if dry_run and entries:
            self.stdout.write(self.style.WARNING("Nothing written. Re-run with --apply."))

    def _upsert(
        self, entry: dict, country: str, added: int, updated: int, unchanged: int
    ) -> tuple[int, int, int]:
        try:
            subdivision = normalize_subdivision_code(
                entry.get("subdivision_code"), country_code=country
            )
        except InvalidJurisdictionError as exc:
            raise CommandError(f"{entry!r}: {exc}") from exc

        for required in ("date", "name", "type"):
            if not entry.get(required):
                raise CommandError(f"Official override missing {required!r}: {entry!r}")
        if not entry.get("reference"):
            raise CommandError(f"Official override must cite a government `reference`: {entry!r}")

        date = entry["date"]
        if not isinstance(date, datetime.date):
            raise CommandError(f"`date` must be an unquoted YAML date: {entry!r}")

        occurrence = int(entry.get("occurrence", 1))
        # Canonical identity — resolved through the alias map, so an official
        # row named "Maulidur Rasul" lands on the SAME key as the provider's
        # "Prophet Muhammad's Birthday" and therefore outranks it.
        source_key = build_canonical_key(
            country_code=country,
            subdivision_code=subdivision,
            year=date.year,
            name=entry["name"],
            occurrence=occurrence,
        )
        provisional = bool(entry.get("provisional", False))
        defaults = {
            "country_code": country,
            "date": date,
            "name": entry["name"],
            "type": entry["type"],
            "subdivision_code": subdivision or "",
            "occurrence": occurrence,
            "external_id": "",
            "source_provider": entry["reference"],
            "source_version": "",
            "retrieved_at": timezone.now(),
            "observed": bool(entry.get("observed", False)),
            # Mirrors the gazette's own "* tertakluk kepada perubahan" marker.
            "provisional": provisional,
            "withdrawn_at": None,
        }
        row = CountryHoliday.objects.filter(
            source_key=source_key, source=CountryHoliday.SOURCE_OFFICIAL
        ).first()
        if row is None:
            CountryHoliday.objects.create(
                source_key=source_key, source=CountryHoliday.SOURCE_OFFICIAL, **defaults
            )
            return added + 1, updated, unchanged
        if (
            row.date == date
            and row.name == entry["name"]
            and row.type == entry["type"]
            and row.provisional == provisional
        ):
            return added, updated, unchanged + 1
        for attr, value in defaults.items():
            setattr(row, attr, value)
        row.save()
        return added, updated + 1, unchanged
