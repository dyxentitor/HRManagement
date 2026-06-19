import datetime
import uuid

import pytest

from modules.employee.models import Employee
from modules.organization.models import Department


@pytest.fixture
def org_dept():
    org_id = uuid.uuid4()
    dept = Department.all_objects.create(org_id=org_id, name="Engineering")
    return org_id, dept


@pytest.mark.django_db
def test_resignation_date_field_defaults_null(org_dept):
    org_id, dept = org_dept
    emp = Employee.all_objects.create(
        org_id=org_id,
        employee_code="E1",
        first_name="A",
        last_name="B",
        email="a@b.com",
        hire_date=datetime.date(2024, 1, 1),
        employment_type="fulltime",
        department=dept,
    )
    assert emp.resignation_date is None


@pytest.mark.django_db
def test_resignation_date_can_be_set(org_dept):
    org_id, dept = org_dept
    emp = Employee.all_objects.create(
        org_id=org_id,
        employee_code="E2",
        first_name="A",
        last_name="B",
        email="a2@b.com",
        hire_date=datetime.date(2024, 1, 1),
        employment_type="fulltime",
        department=dept,
        status="resigned",
        resignation_date=datetime.date(2026, 6, 1),
    )
    emp.refresh_from_db()
    assert emp.resignation_date == datetime.date(2026, 6, 1)
