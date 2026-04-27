"""Integration test: OrgService default lookup hits the real Employee model."""

import datetime
import os
import uuid

import pytest
from cryptography.fernet import Fernet

from modules.employee.models import Employee
from modules.identity.services.org import OrgService
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


def _make_employee(
    org: Organization,
    dept: Department,
    code: str,
    manager: Employee | None = None,
) -> Employee:
    return Employee.all_objects.create(
        org_id=org.id,
        employee_code=code,
        first_name=code,
        last_name="x",
        email=f"{code}@x.com",
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
        bank_name="x",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )


@pytest.fixture
def chain():
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    ceo = _make_employee(org, dept, "CEO")
    vp = _make_employee(org, dept, "VP", manager=ceo)
    mgr = _make_employee(org, dept, "MGR", manager=vp)
    emp = _make_employee(org, dept, "EMP", manager=mgr)
    return ceo, vp, mgr, emp


@pytest.mark.django_db
def test_default_lookup_resolves_real_employees(chain) -> None:
    """OrgService with no explicit lookup uses Employee.objects.get."""
    _ceo, _vp, mgr, emp = chain
    svc = OrgService()  # default lookup
    direct = svc.get_direct_manager(emp.id)
    assert direct is not None
    assert direct.id == mgr.id


@pytest.mark.django_db
def test_default_lookup_full_chain(chain) -> None:
    ceo, vp, mgr, emp = chain
    svc = OrgService()
    chain_ids = [e.id for e in svc.get_reporting_chain(emp.id)]
    assert chain_ids == [mgr.id, vp.id, ceo.id]


@pytest.mark.django_db
def test_default_lookup_unknown_id_returns_none() -> None:
    svc = OrgService()
    assert svc.get_direct_manager(uuid.uuid4()) is None
