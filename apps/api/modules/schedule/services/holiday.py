"""HolidayService — is-holiday, get-for-date, precedence-aware org reconcile."""

from __future__ import annotations

import datetime
import uuid
from dataclasses import dataclass, field

from django.db import transaction
from django.utils import timezone

from common.holidays.canonical import canonical_code
from modules.organization.models import (
    CountryHoliday,
    Organization,
)

from ..models import Holiday, published_holidays


@dataclass
class ReconcileStats:
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


def resolve_reference_holidays(
    *,
    country_code: str,
    year: int,
    subdivision_code: str | None = None,
) -> list[CountryHoliday]:
    """Winning reference row per identity, by source precedence.

    Precedence (highest first): verified official > imported provider >
    legacy fixture. Org-level overrides sit above all of these and are applied
    later, against `Holiday`.
    """
    rows = CountryHoliday.objects.filter(
        country_code=country_code,
        date__year=year,
        withdrawn_at__isnull=True,
    )
    # National holidays always apply; subdivision rows only for that subdivision.
    scoped = [
        row
        for row in rows
        if not row.subdivision_code
        or (subdivision_code and row.subdivision_code == subdivision_code)
    ]

    # Group by CANONICAL identity, not by source_key. Legacy rows predate
    # source_key entirely, and an official row may be subdivision-scoped where
    # the provider's is national — grouping on the raw key would let those
    # compete as separate holidays and yield two "New Year's Day" winners for
    # one org. Resolving the name to its canonical code collapses them so
    # precedence can actually decide.
    winners: dict[tuple[str, int], CountryHoliday] = {}
    for row in scoped:
        key = (canonical_code(country_code=country_code, name=row.name), row.occurrence)
        current = winners.get(key)
        if current is None or row.precedence > current.precedence:
            winners[key] = row
    return list(winners.values())


class HolidayService:
    """Employee-facing reads. Always gated on `published_holidays`.

    Attendance calls these to decide holiday pay, so an unconfirmed
    provisional date reaching here would put a real cost on a guess.
    """

    @staticmethod
    def is_holiday(*, org_id: uuid.UUID, on_date: datetime.date) -> bool:
        return published_holidays(org_id=org_id, date=on_date).exists()

    @staticmethod
    def get_for_date(*, org_id: uuid.UUID, on_date: datetime.date) -> Holiday | None:
        return published_holidays(org_id=org_id, date=on_date).first()

    @staticmethod
    @transaction.atomic
    def confirm(*, org_id: uuid.UUID, holiday_id: uuid.UUID, actor_id: uuid.UUID) -> Holiday:
        """Promote a provisional holiday to published.

        The explicit administrator step the provisional gate exists to force.
        """
        row = Holiday.all_objects.get(id=holiday_id, org_id=org_id, deleted_at__isnull=True)
        row.provisional = False
        row.confirmed_at = timezone.now()
        row.confirmed_by = actor_id
        row.save(update_fields=["provisional", "confirmed_at", "confirmed_by", "updated_at"])
        return row

    @staticmethod
    @transaction.atomic
    def sync_from_country(*, org: Organization, year: int) -> int:
        """Back-compat shim for the original create-only seeder.

        Retained so `seed_provintell` and existing callers keep working while
        the legacy Malaysia fixture is still the fallback source.
        """
        return reconcile_org_holidays(org=org, year=year, dry_run=False).added


def reconcile_org_holidays(
    *,
    org: Organization,
    year: int,
    subdivision_code: str | None = None,
    dry_run: bool = True,
    include_provisional: bool = False,
) -> ReconcileStats:
    """Bring an org's effective Holiday list in line with the reference.

    Safety rules, in order:

    * Provisional (unconfirmed) reference rows are NOT imported by default.
      They are counted as `skipped`. Pass `include_provisional=True` to stage
      them for administrator review — even then they land with
      `provisional=True` and stay invisible to employees until confirmed.
    * Company-created holidays and company exclusions are never touched.
    * Organization overrides are never touched.
    * A day already consumed by attendance is never moved or withdrawn — it
      is reported as a conflict for a human to resolve.
    * Everything else is updated in place via `source_key`, so a moved
      holiday never duplicates.
    """
    subdivision = subdivision_code if subdivision_code is not None else org.default_subdivision_code
    stats = ReconcileStats()

    with transaction.atomic():
        _reconcile(org, year, subdivision or None, stats, include_provisional)
        if dry_run:
            transaction.set_rollback(True)
    return stats


def _consumed_dates(org_id: uuid.UUID, year: int) -> set[datetime.date]:
    """Dates already reflected in attendance — treated as published history."""
    from modules.attendance.models import AttendanceRecord

    return set(
        AttendanceRecord.all_objects.filter(
            org_id=org_id,
            work_date__year=year,
            is_holiday_work=True,
            deleted_at__isnull=True,
        ).values_list("work_date", flat=True)
    )


def _reconcile(
    org: Organization,
    year: int,
    subdivision: str | None,
    stats: ReconcileStats,
    include_provisional: bool = False,
) -> None:
    reference = resolve_reference_holidays(
        country_code=org.country_code,
        year=year,
        subdivision_code=subdivision,
    )
    held_back_keys: set[str] = set()
    if not include_provisional:
        held_back = [ref for ref in reference if ref.provisional]
        reference = [ref for ref in reference if not ref.provisional]
        for ref in held_back:
            held_back_keys.add(ref.source_key or f"legacy:{ref.date}:{ref.name}")
            stats.skipped += 1
            stats.conflicts.append(
                f"{ref.date} {ref.name}: provisional (unconfirmed) — held back from the "
                f"org calendar"
            )
    existing = {
        row.source_key: row
        for row in Holiday.all_objects.filter(
            org_id=org.id, date__year=year, deleted_at__isnull=True
        ).exclude(source_key="")
    }
    # Rows that predate provenance (the original hand-authored fixture) carry no
    # source_key, so they cannot be matched by identity. Without adoption the
    # reconcile would try to INSERT a second row for the same holiday and hit
    # the (org_id, date, name) constraint. Adopting them instead is also how a
    # legacy calendar gets *corrected* in place rather than duplicated.
    adoptable: dict[str, Holiday] = {}
    for row in Holiday.all_objects.filter(
        org_id=org.id, date__year=year, deleted_at__isnull=True, source_key=""
    ):
        if row.is_protected:
            continue
        # Keyed on canonical code alone: a legacy row has no reliable scope, so
        # it may be adopted into whatever scope the reference now assigns.
        adoptable.setdefault(canonical_code(country_code=org.country_code, name=row.name), row)
    protected_dates = {
        row.date
        for row in Holiday.all_objects.filter(
            org_id=org.id, date__year=year, deleted_at__isnull=True
        )
        if row.is_protected
    }
    consumed = _consumed_dates(org.id, year)
    now = timezone.now()
    seen: set[str] = set()

    for ref in reference:
        key = ref.source_key or f"legacy:{ref.date}:{ref.name}"
        seen.add(key)
        row = existing.get(key)

        adopted = False
        if row is None:
            # Adopt a matching legacy row before considering an insert.
            row = adoptable.pop(canonical_code(country_code=ref.country_code, name=ref.name), None)
            if row is not None:
                adopted = True
                row.source_key = key
                verb = "corrected" if row.date != ref.date else "adopted"
                stats.changes.append(f"~ {row.date} -> {ref.date} {ref.name} (legacy {verb})")

        if row is None:
            if ref.date in protected_dates:
                # The org already says something authoritative about this day.
                stats.skipped += 1
                stats.conflicts.append(
                    f"{ref.date} {ref.name}: org already owns this date — not imported"
                )
                continue
            Holiday.all_objects.create(
                org_id=org.id,
                date=ref.date,
                name=ref.name,
                type=ref.type,
                applies_to_country_code=ref.country_code,
                applies_to_state_code=ref.state_code or "",
                applies_to_subdivision_code=ref.subdivision_code or "",
                source=Holiday.SOURCE_IMPORT,
                source_key=key,
                external_id=ref.external_id,
                occurrence=ref.occurrence,
                source_provider=ref.source_provider,
                source_version=ref.source_version,
                imported_at=now,
                observed=ref.observed,
                provisional=ref.provisional,
            )
            stats.added += 1
            stats.changes.append(f"+ {ref.date} {ref.name}")
            continue

        if row.is_protected:
            stats.skipped += 1
            stats.conflicts.append(f"{row.date} {row.name}: org-owned ({row.source}) — left alone")
            continue

        if row.date != ref.date and row.date in consumed:
            stats.conflicted += 1
            stats.conflicts.append(
                f"{row.date} {row.name}: attendance already recorded on this date; "
                f"reference now says {ref.date} — needs manual review"
            )
            continue

        # An administrator's confirmation is a decision, not provider data —
        # re-importing the same still-provisional reference must not silently
        # un-confirm a day the org has already published.
        stays_confirmed = row.confirmed_at is not None and ref.provisional
        target_provisional = False if stays_confirmed else ref.provisional

        if (
            not adopted  # an adoption always writes, if only to stamp source_key
            and row.date == ref.date
            and row.name == ref.name
            and row.type == ref.type
            and row.observed == ref.observed
            and row.provisional == target_provisional
        ):
            stats.unchanged += 1
            continue

        if not adopted:
            stats.changes.append(f"~ {row.date} -> {ref.date} {ref.name}")
        row.date = ref.date
        row.name = ref.name
        row.type = ref.type
        row.applies_to_country_code = ref.country_code
        row.applies_to_subdivision_code = ref.subdivision_code or ""
        row.source = Holiday.SOURCE_IMPORT
        row.external_id = ref.external_id
        row.occurrence = ref.occurrence
        row.source_provider = ref.source_provider
        row.source_version = ref.source_version
        row.imported_at = now
        row.observed = ref.observed
        row.provisional = target_provisional
        row.save()
        stats.updated += 1

    # Legacy rows nothing adopted are AMBIGUOUS, not obviously wrong: the
    # reference winner may simply have been held back as provisional, or the
    # row may be something a human added before provenance existed. Deleting
    # them would silently take a day off staff who already have it, so they are
    # reported for review and left in place.
    for row in adoptable.values():
        stats.conflicted += 1
        stats.conflicts.append(
            f"{row.date} {row.name}: legacy row with no match in the corrected "
            f"reference — left in place for review"
        )

    for key, row in existing.items():
        # `held_back_keys` are still legitimately published upstream — they were
        # merely withheld pending confirmation, so they must not be withdrawn.
        if key in seen or key in held_back_keys or row.is_protected:
            continue
        if row.date in consumed:
            stats.conflicted += 1
            stats.conflicts.append(
                f"{row.date} {row.name}: no longer published but attendance exists — kept"
            )
            continue
        row.deleted_at = now
        row.save(update_fields=["deleted_at", "updated_at"])
        stats.withdrawn += 1
        stats.changes.append(f"- {row.date} {row.name} (no longer published)")
