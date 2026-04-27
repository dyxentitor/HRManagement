"""HolidayService — is-holiday, get-for-date, sync from country reference."""

from __future__ import annotations

import datetime
import uuid

from django.db import transaction

from modules.organization.models import (
    CountryHoliday,
    Organization,
)

from ..models import Holiday


class HolidayService:
    @staticmethod
    def is_holiday(*, org_id: uuid.UUID, on_date: datetime.date) -> bool:
        return Holiday.all_objects.filter(
            org_id=org_id,
            date=on_date,
            deleted_at__isnull=True,
        ).exists()

    @staticmethod
    def get_for_date(*, org_id: uuid.UUID, on_date: datetime.date) -> Holiday | None:
        return Holiday.all_objects.filter(
            org_id=org_id,
            date=on_date,
            deleted_at__isnull=True,
        ).first()

    @staticmethod
    @transaction.atomic
    def sync_from_country(*, org: Organization, year: int) -> int:
        """Copy CountryHoliday rows for org.country_code in `year` into Holiday.

        Idempotent: existing (org_id, date, name) rows are left alone; only new
        ones are inserted.
        """
        candidates = CountryHoliday.objects.filter(
            country_code=org.country_code,
            date__year=year,
        )
        n_created = 0
        for ch in candidates:
            exists = Holiday.all_objects.filter(
                org_id=org.id,
                date=ch.date,
                name=ch.name,
                deleted_at__isnull=True,
            ).exists()
            if not exists:
                Holiday.all_objects.create(
                    org_id=org.id,
                    date=ch.date,
                    name=ch.name,
                    type=ch.type,
                    applies_to_country_code=ch.country_code,
                    applies_to_state_code=ch.state_code or "",
                )
                n_created += 1
        return n_created
