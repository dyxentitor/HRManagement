"""Smoke tests for v1.8.0 LeaveType field additions."""

from decimal import Decimal

import pytest

from modules.leave.models import LeaveType
from modules.organization.models import Organization


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="Acme",
        slug="acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.mark.django_db
def test_leave_type_v18_fields_default_values(org: Organization) -> None:
    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual",
        accrual_type="annual",
        default_days=Decimal("8"),
    )
    assert lt.carry_forward_expiry_months is None
    assert lt.requires_service_months == 0
    assert lt.notice_days_required == 0
    assert lt.max_per_lifetime_events is None


@pytest.mark.django_db
def test_leave_type_v18_fields_writable(org: Organization) -> None:
    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="PATERNITY",
        name="Paternity",
        accrual_type="event_based",
        default_days=Decimal("7"),
        carry_forward_expiry_months=12,
        requires_service_months=12,
        notice_days_required=30,
        max_per_lifetime_events=5,
    )
    fresh = LeaveType.all_objects.get(id=lt.id)
    assert fresh.carry_forward_expiry_months == 12
    assert fresh.requires_service_months == 12
    assert fresh.notice_days_required == 30
    assert fresh.max_per_lifetime_events == 5
