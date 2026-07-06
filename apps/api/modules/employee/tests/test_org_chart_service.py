"""Tests for the Organization Chart query service."""

import datetime
import os

import pytest
from cryptography.fernet import Fernet

from modules.employee.models import Employee
from modules.employee.services import org_chart
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


def _org(slug: str = "x") -> Organization:
    return Organization.objects.create(
        name="X",
        slug=slug,
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def _emp(org, dept, code, manager=None, first="", **over) -> Employee:
    return Employee.all_objects.create(
        org_id=org.id,
        employee_code=code,
        first_name=first or code,
        last_name="x",
        email=f"{code.lower()}@x.com",
        phone="+1",
        date_of_birth=datetime.date(1990, 1, 1),
        gender="other",
        nationality="MY",
        marital_status="single",
        address_line1="x",
        city="x",
        state="x",
        postcode="00000",
        country_code="MY",
        department=dept,
        manager=manager,
        role_title="x",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
        **over,
    )


@pytest.mark.django_db
def test_roots_returns_only_managerless():
    org = _org()
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    ceo = _emp(org, dept, "CEO")
    _emp(org, dept, "VP", manager=ceo)
    roots = list(org_chart.roots_qs(org.id))
    assert [e.id for e in roots] == [ceo.id]
    assert roots[0]._dr == 1


@pytest.mark.django_db
def test_children_and_counts():
    org = _org()
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    ceo = _emp(org, dept, "CEO")
    vp = _emp(org, dept, "VP", manager=ceo)
    _emp(org, dept, "IC", manager=vp)
    kids = list(org_chart.children_qs(org.id, ceo.id))
    assert [e.id for e in kids] == [vp.id]
    assert kids[0]._dr == 1  # vp has one report


@pytest.mark.django_db
def test_soft_deleted_excluded_from_roots_and_counts():
    org = _org()
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    ceo = _emp(org, dept, "CEO")
    gone = _emp(org, dept, "GONE", manager=ceo)
    gone.deleted_at = datetime.datetime(2024, 6, 1, tzinfo=datetime.UTC)
    gone.save()
    roots = list(org_chart.roots_qs(org.id))
    assert roots[0]._dr == 0  # soft-deleted report not counted


@pytest.mark.django_db
def test_department_groups_excludes_empty():
    org = _org()
    d1 = Department.all_objects.create(org_id=org.id, name="Eng")
    Department.all_objects.create(org_id=org.id, name="Empty")
    _emp(org, d1, "CEO")
    groups = org_chart.department_groups(org.id)
    assert {g["name"]: g["head_count"] for g in groups} == {"Eng": 1}


@pytest.mark.django_db
def test_department_members():
    org = _org()
    d1 = Department.all_objects.create(org_id=org.id, name="Eng")
    d2 = Department.all_objects.create(org_id=org.id, name="Sales")
    a = _emp(org, d1, "A")
    _emp(org, d2, "B")
    members = list(org_chart.department_members_qs(org.id, d1.id))
    assert [m.id for m in members] == [a.id]


@pytest.mark.django_db
def test_search_matches_and_ancestor_path():
    org = _org()
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    ceo = _emp(org, dept, "CEO", first="Jane")
    vp = _emp(org, dept, "VP", manager=ceo, first="Sam")
    ic = _emp(org, dept, "IC", manager=vp, first="Priya")
    results = org_chart.search_nodes(org.id, "priya")
    assert len(results) == 1
    emp, ancestors = results[0]
    assert emp.id == ic.id
    assert ancestors == [str(ceo.id), str(vp.id)]


@pytest.mark.django_db
def test_search_empty_term_returns_empty():
    org = _org()
    assert org_chart.search_nodes(org.id, "  ") == []
