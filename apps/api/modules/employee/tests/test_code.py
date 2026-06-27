import datetime as dt

import pytest

from modules.employee.models import Employee
from modules.employee.services.code import employee_code_prefix, next_employee_code
from modules.organization.models import Department, Organization


def _org(slug, **settings):
    return Organization.objects.create(
        name="X",
        slug=slug,
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
        settings=settings,
    )


def _emp(org, code):
    dept = Department.all_objects.create(org_id=org.id, name=f"D-{code}")
    return Employee.all_objects.create(
        org_id=org.id,
        employee_code=code,
        first_name="A",
        last_name="b",
        email=f"{code}@x.com",
        department=dept,
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )


@pytest.mark.django_db
def test_prefix_defaults_to_emp_and_reads_settings():
    assert employee_code_prefix(_org("c-1").id) == "EMP"
    assert employee_code_prefix(_org("c-2", employee_code_prefix="PVT").id) == "PVT"


@pytest.mark.django_db
def test_next_code_is_max_plus_one_for_current_year():
    org = _org("c-3")
    year = dt.date.today().year
    assert next_employee_code(org.id) == f"EMP-{year}-0001"
    _emp(org, f"EMP-{year}-0001")
    _emp(org, f"EMP-{year}-0007")  # gap
    _emp(org, "01001")  # legacy, ignored
    _emp(org, f"EMP-{year - 1}-0099")  # prior year, ignored
    assert next_employee_code(org.id) == f"EMP-{year}-0008"  # max(7)+1, gap not reused
