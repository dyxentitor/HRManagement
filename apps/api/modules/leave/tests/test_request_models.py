"""LeaveRequest + LeaveApproval models."""

import datetime
import uuid
from decimal import Decimal

import pytest

from modules.leave.models import LeaveApproval, LeaveRequest, LeaveType
from modules.organization.models import Organization


@pytest.fixture
def setup():
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual",
        accrual_type="annual",
        default_days=Decimal("14"),
        is_paid=True,
        is_statutory=True,
        gender_restriction="any",
    )
    return org, lt


@pytest.mark.django_db
def test_leave_request_create_draft(setup) -> None:
    org, lt = setup
    r = LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=uuid.uuid4(),
        leave_type=lt,
        start_date=datetime.date(2026, 6, 1),
        end_date=datetime.date(2026, 6, 3),
        total_days=Decimal("3"),
        is_half_day=False,
        reason="Family trip",
    )
    assert r.status == "draft"
    assert r.current_level == 0


@pytest.mark.django_db
def test_leave_request_half_day(setup) -> None:
    org, lt = setup
    r = LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=uuid.uuid4(),
        leave_type=lt,
        start_date=datetime.date(2026, 6, 1),
        end_date=datetime.date(2026, 6, 1),
        total_days=Decimal("0.5"),
        is_half_day=True,
        half_day_period="am",
        reason="Doctor",
    )
    assert r.is_half_day is True
    assert r.half_day_period == "am"


@pytest.mark.django_db
def test_leave_approval_link(setup) -> None:
    org, lt = setup
    r = LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=uuid.uuid4(),
        leave_type=lt,
        start_date=datetime.date(2026, 6, 1),
        end_date=datetime.date(2026, 6, 3),
        total_days=Decimal("3"),
        is_half_day=False,
        reason="x",
    )
    approver_id = uuid.uuid4()
    approval = LeaveApproval.objects.create(
        leave_request=r,
        level=1,
        approver_id=approver_id,
        status="pending",
    )
    assert approval.status == "pending"
    assert r.approvals.count() == 1
