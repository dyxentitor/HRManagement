"""Tests for the three soft-warning rules used by bulk-fill."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest

from common.managers import set_current_org_id
from modules.employee.models import Employee, Team
from modules.leave.models import LeaveRequest, LeaveType
from modules.organization.models import Department, Organization
from modules.schedule.models import Shift
from modules.schedule.services.warnings import compute_warnings

pytestmark = pytest.mark.django_db


def _make_employee(org, dept, **overrides):
    defaults = dict(
        org_id=org.id,
        employee_code="E1",
        first_name="A",
        last_name="B",
        email="a@b.com",
        phone="+60100000000",
        date_of_birth="1990-01-01",
        gender="other",
        nationality="MY",
        marital_status="single",
        address_line1="x",
        city="KL",
        state="KL",
        postcode="50000",
        country_code="MY",
        hire_date="2024-01-01",
        employment_type="fulltime",
        role_title="Eng",
        status="active",
        department=dept,
        bank_name="X",
        emergency_contact_name="X",
        emergency_contact_relationship="self",
        emergency_contact_phone="+60100000099",
    )
    defaults.update(overrides)
    return Employee.all_objects.create(**defaults)


@pytest.fixture
def setup(db):
    org = Organization.objects.create(
        slug="acme",
        name="Acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
        status="active",
    )
    set_current_org_id(org.id)
    dept = Department.all_objects.create(org_id=org.id, name="Ops")
    team = Team.all_objects.create(org_id=org.id, name="Focus", sort_order=0, min_headcount=2)
    e1 = _make_employee(
        org,
        dept,
        employee_code="E1",
        first_name="A",
        email="a@a.com",
        phone="+60100000000",
        emergency_contact_phone="+60100000091",
        team=team,
    )
    e2 = _make_employee(
        org,
        dept,
        employee_code="E2",
        first_name="C",
        email="c@c.com",
        phone="+60100000001",
        emergency_contact_phone="+60100000092",
        team=team,
    )
    shift = Shift.all_objects.create(
        org_id=org.id,
        name="Long",
        code="L",
        start_time=dt.time(9, 0),
        end_time=dt.time(23, 0),
    )
    return org, team, e1, e2, shift


def test_no_warnings_clean_assignment(setup):
    org, _, e1, e2, shift = setup
    cells = [
        {"employee_id": str(e1.id), "work_date": "2026-03-04"},
        {"employee_id": str(e2.id), "work_date": "2026-03-04"},
    ]
    warnings = compute_warnings(org_id=org.id, cells=cells, shift_id=str(shift.id))
    assert warnings == []


def test_warning_overtime_over_48h(setup):
    """Schedule 4 days x 14h on the same week => 56h > 48h."""
    org, _, e1, e2, shift = setup
    cells = [
        {"employee_id": str(e1.id), "work_date": "2026-03-02"},  # Mon
        {"employee_id": str(e1.id), "work_date": "2026-03-03"},  # Tue
        {"employee_id": str(e1.id), "work_date": "2026-03-04"},  # Wed
        {"employee_id": str(e1.id), "work_date": "2026-03-05"},  # Thu
        {"employee_id": str(e2.id), "work_date": "2026-03-02"},  # filler for coverage
    ]
    warnings = compute_warnings(org_id=org.id, cells=cells, shift_id=str(shift.id))
    assert any(w["rule"] == "overtime" for w in warnings)


def test_warning_leave_overlap(setup):
    org, _, e1, _, shift = setup
    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="annual",
        name="Annual",
        accrual_type="annual",
    )
    LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=e1.id,
        leave_type=lt,
        start_date=dt.date(2026, 3, 4),
        end_date=dt.date(2026, 3, 6),
        total_days=Decimal("3"),
        status="approved",
    )
    cells = [{"employee_id": str(e1.id), "work_date": "2026-03-04"}]
    warnings = compute_warnings(org_id=org.id, cells=cells, shift_id=str(shift.id))
    assert any(w["rule"] == "leave_overlap" for w in warnings)


def test_warning_coverage_drop(setup):
    """min_headcount=2 - only one cell on Mar 4 means coverage is 1/2."""
    org, _, e1, _, shift = setup
    cells = [{"employee_id": str(e1.id), "work_date": "2026-03-04"}]
    warnings = compute_warnings(org_id=org.id, cells=cells, shift_id=str(shift.id))
    assert any(w["rule"] == "coverage_drop" for w in warnings)
