"""Import normalized provider holidays into the global CountryHoliday reference.

Country-neutral: no Malaysia-specific branching lives here. The only inputs
are an ISO jurisdiction, a year and a provider name.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from django.db import transaction
from django.utils import timezone

from common.holidays import NormalizedHoliday, get_provider
from common.holidays.iso import normalize_country_code, normalize_subdivision_code

from .models import CountryHoliday


@dataclass
class ImportStats:
    """Outcome counters for one import run."""

    added: int = 0
    updated: int = 0
    unchanged: int = 0
    withdrawn: int = 0
    skipped: int = 0
    conflicted: int = 0
    conflicts: list[str] = field(default_factory=list)
    changes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, int]:
        return {
            "added": self.added,
            "updated": self.updated,
            "unchanged": self.unchanged,
            "withdrawn": self.withdrawn,
            "skipped": self.skipped,
            "conflicted": self.conflicted,
        }


def _differs(row: CountryHoliday, rec: NormalizedHoliday) -> bool:
    return (
        row.date != rec.date
        or row.name != rec.name
        or row.type != rec.holiday_type
        or row.observed != rec.observed
        or row.provisional != rec.provisional
        or bool(row.withdrawn_at)
    )


def import_country_holidays(
    *,
    country_code: str,
    year: int,
    subdivision_code: str | None = None,
    provider_name: str | None = None,
    language: str | None = None,
    include_observed: bool = True,
    dry_run: bool = True,
) -> ImportStats:
    """Reconcile one (country, subdivision, year) slice of the reference table.

    Idempotent: running twice produces `unchanged` on the second pass.
    Applied changes run inside a transaction; `dry_run` computes the same
    counts and writes nothing.
    """
    country = normalize_country_code(country_code)
    subdivision = normalize_subdivision_code(subdivision_code, country_code=country)
    provider = get_provider(provider_name)

    records = provider.fetch(
        country_code=country,
        year=year,
        subdivision_code=subdivision,
        language=language,
        include_observed=include_observed,
    )

    stats = ImportStats()
    with transaction.atomic():
        _apply(records, country, subdivision, year, provider, stats)
        if dry_run:
            transaction.set_rollback(True)
    return stats


def _apply(
    records: list[NormalizedHoliday],
    country: str,
    subdivision: str | None,
    year: int,
    provider,
    stats: ImportStats,
) -> None:
    scope = {
        "country_code": country,
        "subdivision_code": subdivision or "",
        "date__year": year,
    }
    # Only rows this import owns are candidates for update/withdrawal.
    existing = {
        row.source_key: row
        for row in CountryHoliday.objects.filter(
            source=CountryHoliday.SOURCE_PROVIDER, **scope
        ).exclude(source_key="")
    }
    # Higher-precedence rows for the same identities — these win, so the
    # provider row is recorded but flagged rather than silently applied.
    official_keys = set(
        CountryHoliday.objects.filter(
            source=CountryHoliday.SOURCE_OFFICIAL, withdrawn_at__isnull=True, **scope
        ).values_list("source_key", flat=True)
    )

    seen: set[str] = set()
    for rec in records:
        seen.add(rec.source_key)
        row = existing.get(rec.source_key)

        if row is None:
            CountryHoliday.objects.create(
                country_code=rec.country_code,
                date=rec.date,
                name=rec.name,
                type=rec.holiday_type,
                state_code=None,
                source_key=rec.source_key,
                external_id=rec.external_id,
                occurrence=rec.occurrence,
                subdivision_code=rec.subdivision_code or "",
                source=CountryHoliday.SOURCE_PROVIDER,
                source_provider=rec.provider,
                source_version=rec.source_version,
                retrieved_at=rec.retrieved_at,
                observed=rec.observed,
                provisional=rec.provisional,
            )
            stats.added += 1
            stats.changes.append(f"+ {rec.date} {rec.name}")
        elif _differs(row, rec):
            if rec.source_key in official_keys:
                # An official correction outranks the provider. Keep the
                # provider row current for audit, but surface the divergence.
                stats.conflicted += 1
                stats.conflicts.append(
                    f"{rec.source_key}: provider says {rec.date}, "
                    f"official override present — official wins"
                )
            else:
                stats.changes.append(f"~ {row.date} -> {rec.date} {rec.name}")
            was = row.date
            row.date = rec.date
            row.name = rec.name
            row.type = rec.holiday_type
            row.external_id = rec.external_id
            row.occurrence = rec.occurrence
            row.observed = rec.observed
            row.provisional = rec.provisional
            row.source_provider = rec.provider
            row.source_version = rec.source_version
            row.retrieved_at = rec.retrieved_at
            row.withdrawn_at = None
            row.save()
            if was != rec.date or rec.source_key not in official_keys:
                stats.updated += 1
        else:
            row.source_version = rec.source_version
            row.retrieved_at = rec.retrieved_at
            row.save(update_fields=["source_version", "retrieved_at"])
            stats.unchanged += 1

    # Anything we previously imported that upstream no longer returns is
    # withdrawn, never deleted — history stays auditable and a re-import can
    # revive it.
    for key, row in existing.items():
        if key in seen or row.withdrawn_at:
            continue
        row.withdrawn_at = timezone.now()
        row.save(update_fields=["withdrawn_at"])
        stats.withdrawn += 1
        stats.changes.append(f"- {row.date} {row.name} (no longer published)")
