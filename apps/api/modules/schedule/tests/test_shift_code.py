"""Tests for Shift.code field, backfill, and uniqueness."""

from __future__ import annotations

import pytest
from django.db import IntegrityError

from common.managers import set_current_org_id
from modules.organization.models import Organization
from modules.schedule.models import Shift

pytestmark = pytest.mark.django_db


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        slug="acme",
        name="Acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
        status="active",
    )


def test_shift_create_with_code(org):
    set_current_org_id(org.id)
    s = Shift.all_objects.create(
        org_id=org.id,
        name="Morning",
        start_time="09:00",
        end_time="18:00",
        code="M",
    )
    assert Shift.all_objects.get(pk=s.pk).code == "M"


def test_shift_code_uppercase_on_save(org):
    set_current_org_id(org.id)
    s = Shift.all_objects.create(
        org_id=org.id,
        name="Day",
        start_time="08:00",
        end_time="17:00",
        code="d",
    )
    s.refresh_from_db()
    assert s.code == "D"


def test_shift_code_unique_per_org(org):
    set_current_org_id(org.id)
    Shift.all_objects.create(
        org_id=org.id,
        name="Morning",
        start_time="09:00",
        end_time="18:00",
        code="M",
    )
    with pytest.raises(IntegrityError):
        Shift.all_objects.create(
            org_id=org.id,
            name="Maintenance",
            start_time="00:00",
            end_time="08:00",
            code="M",
        )


def test_shift_code_unique_only_among_alive(org):
    """Soft-deleted shifts don't block re-using a code."""
    set_current_org_id(org.id)
    s1 = Shift.all_objects.create(
        org_id=org.id,
        name="Morning",
        start_time="09:00",
        end_time="18:00",
        code="M",
    )
    s1.delete()  # soft-delete via TenantBaseModel
    Shift.all_objects.create(
        org_id=org.id,
        name="Morning2",
        start_time="09:00",
        end_time="18:00",
        code="M",
    )
