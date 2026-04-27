"""Tests for /employees/{id}/{reporting-chain,direct-reports,probation-status}."""

import datetime
import os

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


def _emp(
    org,
    dept,
    code: str,
    manager: Employee | None = None,
    probation_end: datetime.date | None = None,
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
        probation_end_date=probation_end,
    )


def _hr_client(org: Organization) -> APIClient:
    user = User.objects.create_user(
        email="hr@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="hr_manager", name="HR", is_system=True)
    for code in ("employee:read:org", "employee:write:org"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    client = APIClient()
    body = client.post(
        "/api/v1/auth/login", {"email": "hr@x.com", "password": "x"}, format="json"
    ).json()  # pragma: allowlist secret
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access_token']}")
    return client


@pytest.fixture
def org_and_chain():
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    ceo = _emp(org, dept, "CEO")
    vp = _emp(org, dept, "VP", manager=ceo)
    mgr = _emp(org, dept, "MGR", manager=vp)
    emp = _emp(org, dept, "EMP", manager=mgr)
    return org, dept, (ceo, vp, mgr, emp)


@pytest.mark.django_db
def test_reporting_chain_walks_to_root(org_and_chain) -> None:
    org, _, (ceo, vp, mgr, emp) = org_and_chain
    client = _hr_client(org)
    resp = client.get(f"/api/v1/employees/{emp.id}/reporting-chain/")
    assert resp.status_code == 200
    body = resp.json()
    codes = [r["employee_code"] for r in body]
    assert codes == ["MGR", "VP", "CEO"]


@pytest.mark.django_db
def test_direct_reports(org_and_chain) -> None:
    org, _, (ceo, vp, mgr, emp) = org_and_chain
    client = _hr_client(org)
    resp = client.get(f"/api/v1/employees/{mgr.id}/direct-reports/")
    assert resp.status_code == 200
    body = resp.json()
    assert [r["employee_code"] for r in body] == ["EMP"]


@pytest.mark.django_db
def test_direct_reports_empty(org_and_chain) -> None:
    org, _, (_ceo, _vp, _mgr, emp) = org_and_chain
    client = _hr_client(org)
    resp = client.get(f"/api/v1/employees/{emp.id}/direct-reports/")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.django_db
def test_probation_status_active() -> None:
    org = Organization.objects.create(
        name="X",
        slug="x2",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    end = datetime.date.today() + datetime.timedelta(days=15)
    e = _emp(org, dept, "P1", probation_end=end)
    client = _hr_client(org)
    resp = client.get(f"/api/v1/employees/{e.id}/probation-status/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "in_probation"
    assert body["days_remaining"] == 15
    assert body["probation_end_date"] == end.isoformat()


@pytest.mark.django_db
def test_probation_status_no_probation_set() -> None:
    org = Organization.objects.create(
        name="X",
        slug="x3",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    e = _emp(org, dept, "C1")  # no probation_end_date
    client = _hr_client(org)
    resp = client.get(f"/api/v1/employees/{e.id}/probation-status/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "confirmed"
    assert body["days_remaining"] is None


@pytest.mark.django_db
def test_probation_status_overdue() -> None:
    org = Organization.objects.create(
        name="X",
        slug="x4",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    end = datetime.date.today() - datetime.timedelta(days=5)
    e = _emp(org, dept, "P2", probation_end=end)
    client = _hr_client(org)
    resp = client.get(f"/api/v1/employees/{e.id}/probation-status/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "overdue_confirmation"
    assert body["days_remaining"] == -5
