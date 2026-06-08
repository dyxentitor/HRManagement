"""Half-day + day-count validation in LeaveRequestSerializer."""

from decimal import Decimal

import pytest

from common.managers import clear_current_org_id, set_current_org_id
from modules.leave.models import LeaveType
from modules.leave.serializers import LeaveRequestSerializer
from modules.organization.models import Organization


@pytest.fixture
def lt():
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    set_current_org_id(org.id)
    try:
        yield LeaveType.all_objects.create(
            org_id=org.id,
            code="ANNUAL",
            name="Annual",
            accrual_type="annual",
            default_days=Decimal("14"),
            is_paid=True,
            is_statutory=True,
            gender_restriction="any",
        )
    finally:
        clear_current_org_id()


def _data(lt, **over):
    base = {
        "leave_type": str(lt.id),
        "start_date": "2026-06-01",
        "end_date": "2026-06-01",
        "total_days": "1",
        "is_half_day": False,
        "half_day_period": "",
        "reason": "x",
    }
    base.update(over)
    return base


@pytest.mark.django_db
def test_half_day_single_date_is_half(lt):
    ser = LeaveRequestSerializer(
        data=_data(lt, is_half_day=True, half_day_period="am", total_days="9")
    )
    assert ser.is_valid(), ser.errors
    assert ser.validated_data["total_days"] == Decimal("0.5")


@pytest.mark.django_db
def test_half_day_with_range_rejected(lt):
    ser = LeaveRequestSerializer(
        data=_data(
            lt,
            start_date="2026-06-01",
            end_date="2026-06-05",
            is_half_day=True,
            half_day_period="am",
        )
    )
    assert not ser.is_valid()
    assert "end_date" in ser.errors


@pytest.mark.django_db
def test_half_day_missing_period_rejected(lt):
    ser = LeaveRequestSerializer(data=_data(lt, is_half_day=True, half_day_period=""))
    assert not ser.is_valid()
    assert "half_day_period" in ser.errors


@pytest.mark.django_db
def test_full_day_range_inclusive_count(lt):
    ser = LeaveRequestSerializer(
        data=_data(lt, start_date="2026-06-01", end_date="2026-06-05", total_days="0.5")
    )
    assert ser.is_valid(), ser.errors
    assert ser.validated_data["total_days"] == Decimal("5")  # client 0.5 overwritten


@pytest.mark.django_db
def test_full_day_end_before_start_rejected(lt):
    ser = LeaveRequestSerializer(data=_data(lt, start_date="2026-06-05", end_date="2026-06-01"))
    assert not ser.is_valid()
    assert "end_date" in ser.errors
