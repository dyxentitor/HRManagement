import datetime as dt

import pytest

from modules.assignments.models import Assignment, AssignmentRecipient
from modules.assignments.services import engine
from modules.employee.models import Employee
from modules.leave.models import LeaveRequest, LeaveType
from modules.organization.models import Department, Organization


@pytest.fixture
def org_emp(db):
    org = Organization.objects.create(
        name="X",
        slug="x-auto",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    emp = Employee.all_objects.create(
        org_id=org.id,
        employee_code="E1",
        first_name="E",
        last_name="x",
        email="e1@x.com",
        department=dept,
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )
    return org, emp


def _pending(org, emp, complete_on):
    a = Assignment.objects.create(org_id=org.id, title="T", type="task", complete_on=complete_on)
    return AssignmentRecipient.objects.create(org_id=org.id, assignment=a, employee_id=emp.id)


@pytest.mark.django_db
def test_fire_trigger_completes_only_matching(org_emp):
    org, emp = org_emp
    r_match = _pending(org, emp, "leave_requested")
    r_manual = _pending(org, emp, "manual")
    n = engine.fire_trigger(org.id, emp.id, "leave_requested")
    assert n == 1
    r_match.refresh_from_db()
    r_manual.refresh_from_db()
    assert r_match.status == "completed"
    assert r_manual.status == "pending"


@pytest.mark.django_db
def test_leave_request_signal_auto_completes(org_emp):
    org, emp = org_emp
    r = _pending(org, emp, "leave_requested")
    lt = LeaveType.objects.create(org_id=org.id, code="ANNUAL", name="Annual")
    LeaveRequest.objects.create(
        org_id=org.id,
        employee_id=emp.id,
        leave_type=lt,
        start_date=dt.date.today(),
        end_date=dt.date.today(),
        total_days=1,
        status="pending",
    )
    r.refresh_from_db()
    assert r.status == "completed"
    assert r.note == "auto:leave_requested"
