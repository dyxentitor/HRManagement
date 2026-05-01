"""Tests for the calendar service: assembly + scoping."""

from __future__ import annotations

import datetime as dt
import uuid

import pytest

from common.managers import set_current_org_id
from modules.employee.models import Employee, Team
from modules.organization.models import Department, Organization
from modules.schedule.models import Holiday, Shift, ShiftAssignment
from modules.schedule.services.calendar import build_calendar

pytestmark = pytest.mark.django_db


def _make_employee(org, dept, **overrides):
    """Helper that fills all Employee required fields."""
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
def org_setup(db):
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
    team = Team.all_objects.create(org_id=org.id, name="Focus", sort_order=0, min_headcount=1)
    emp = _make_employee(org, dept, team=team)
    shift = Shift.all_objects.create(
        org_id=org.id,
        name="Morning",
        code="M",
        start_time=dt.time(9, 0),
        end_time=dt.time(18, 0),
    )
    return org, dept, team, emp, shift


def test_calendar_returns_teams_with_members(org_setup):
    org, _, team, emp, _ = org_setup
    payload = build_calendar(
        org_id=org.id,
        date_from=dt.date(2026, 3, 1),
        date_to=dt.date(2026, 3, 31),
    )
    found = next(t for t in payload["teams"] if t["id"] == str(team.id))
    assert found["min_headcount"] == 1
    assert any(m["id"] == str(emp.id) for m in found["members"])


def test_calendar_returns_assignments_in_range(org_setup):
    org, _, _, emp, shift = org_setup
    ShiftAssignment.all_objects.create(
        org_id=org.id,
        employee=emp,
        shift=shift,
        work_date=dt.date(2026, 3, 4),
        assigned_by=uuid.uuid4(),
    )
    payload = build_calendar(
        org_id=org.id,
        date_from=dt.date(2026, 3, 1),
        date_to=dt.date(2026, 3, 31),
    )
    assert len(payload["assignments"]) == 1
    assert payload["assignments"][0]["work_date"] == "2026-03-04"
    assert payload["assignments"][0]["shift_code"] == "M"


def test_calendar_excludes_inactive_by_default(org_setup):
    org, dept, team, _, _ = org_setup
    _make_employee(
        org,
        dept,
        employee_code="E2",
        first_name="C",
        last_name="D",
        email="c@d.com",
        phone="+60100000001",
        emergency_contact_phone="+60100000098",
        status="terminated",
        team=team,
    )
    payload = build_calendar(
        org_id=org.id,
        date_from=dt.date(2026, 3, 1),
        date_to=dt.date(2026, 3, 31),
    )
    members = [m for t in payload["teams"] for m in t["members"]]
    assert all(m["status"] == "active" for m in members)


def test_calendar_includes_inactive_when_requested(org_setup):
    org, dept, team, _, _ = org_setup
    _make_employee(
        org,
        dept,
        employee_code="E2",
        first_name="C",
        last_name="D",
        email="c@d.com",
        phone="+60100000001",
        emergency_contact_phone="+60100000098",
        status="terminated",
        team=team,
    )
    payload = build_calendar(
        org_id=org.id,
        date_from=dt.date(2026, 3, 1),
        date_to=dt.date(2026, 3, 31),
        include_inactive=True,
    )
    members = [m for t in payload["teams"] for m in t["members"]]
    assert any(m["status"] == "terminated" for m in members)


def test_calendar_holidays_in_range(org_setup):
    org, _, _, _, _ = org_setup
    Holiday.all_objects.create(
        org_id=org.id,
        date=dt.date(2026, 3, 10),
        name="Hari Raya",
        type="federal",
    )
    payload = build_calendar(
        org_id=org.id,
        date_from=dt.date(2026, 3, 1),
        date_to=dt.date(2026, 3, 31),
    )
    assert any(h["date"] == "2026-03-10" and h["name"] == "Hari Raya" for h in payload["holidays"])


def test_calendar_stats_coverage_flags_under_min(org_setup):
    org, _, _, emp, shift = org_setup
    ShiftAssignment.all_objects.create(
        org_id=org.id,
        employee=emp,
        shift=shift,
        work_date=dt.date(2026, 3, 4),
        assigned_by=uuid.uuid4(),
    )
    payload = build_calendar(
        org_id=org.id,
        date_from=dt.date(2026, 3, 4),
        date_to=dt.date(2026, 3, 5),
    )
    coverage = payload["stats"]["coverage"][0]["by_day"]
    by_date = {c["date"]: c for c in coverage}
    assert by_date["2026-03-04"]["ok"] is True
    assert by_date["2026-03-04"]["scheduled"] == 1
    assert by_date["2026-03-05"]["ok"] is False
    assert by_date["2026-03-05"]["scheduled"] == 0


def test_calendar_orphans_to_unassigned_if_team_soft_deleted(org_setup):
    """If a team is soft-deleted, members should appear under 'Unassigned'."""
    org, dept, team, emp, _ = org_setup
    team.delete()  # soft delete
    payload = build_calendar(
        org_id=org.id,
        date_from=dt.date(2026, 3, 1),
        date_to=dt.date(2026, 3, 31),
    )
    # The deleted team should not appear in teams[]
    assert all(t["id"] != str(team.id) for t in payload["teams"] if t["id"])
    # But the orphaned employee should still be visible under 'Unassigned'
    unassigned = next((t for t in payload["teams"] if t["name"] == "Unassigned"), None)
    assert unassigned is not None
    assert any(m["id"] == str(emp.id) for m in unassigned["members"])


def test_calendar_zero_duration_shift_is_zero_hours(org_setup):
    """A degenerate 0-duration shift (start == end, not crosses_midnight) reports 0h, not 24h."""
    org, _, _, emp, _ = org_setup
    bad_shift = Shift.all_objects.create(
        org_id=org.id,
        name="Broken",
        code="B",
        start_time=dt.time(9, 0),
        end_time=dt.time(9, 0),
    )
    ShiftAssignment.all_objects.create(
        org_id=org.id,
        employee=emp,
        shift=bad_shift,
        work_date=dt.date(2026, 3, 4),
        assigned_by=uuid.uuid4(),
    )
    payload = build_calendar(
        org_id=org.id,
        date_from=dt.date(2026, 3, 4),
        date_to=dt.date(2026, 3, 4),
    )
    by_day = {d["date"]: d for d in payload["stats"]["by_day"]}
    assert by_day["2026-03-04"]["hours"] == 0


def test_calendar_midnight_crossing_shift_is_24h_when_start_eq_end(org_setup):
    """A shift with start==end AND crosses_midnight=True reports 24h (e.g., 24x7 standby)."""
    org, _, _, emp, _ = org_setup
    standby = Shift.all_objects.create(
        org_id=org.id,
        name="Standby",
        code="X",
        start_time=dt.time(0, 0),
        end_time=dt.time(0, 0),
        crosses_midnight=True,
    )
    ShiftAssignment.all_objects.create(
        org_id=org.id,
        employee=emp,
        shift=standby,
        work_date=dt.date(2026, 3, 4),
        assigned_by=uuid.uuid4(),
    )
    payload = build_calendar(
        org_id=org.id,
        date_from=dt.date(2026, 3, 4),
        date_to=dt.date(2026, 3, 4),
    )
    by_day = {d["date"]: d for d in payload["stats"]["by_day"]}
    assert by_day["2026-03-04"]["hours"] == 24
