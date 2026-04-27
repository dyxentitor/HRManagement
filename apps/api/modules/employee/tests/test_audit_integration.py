"""Tests that Employee writes append to the audit log."""

import datetime
import os

import pytest
from cryptography.fernet import Fernet

from common.audit.models import AuditLog
from modules.employee.models import Employee
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.fixture
def org_dept():
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    return org, dept


def _make(org, dept, **overrides):
    base = dict(
        org_id=org.id,
        employee_code="X",
        first_name="A",
        last_name="B",
        email="a@b.com",
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
        role_title="x",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        bank_name="x",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )
    base.update(overrides)
    return Employee.all_objects.create(**base)


@pytest.mark.django_db
def test_employee_create_appends_audit(org_dept) -> None:
    org, dept = org_dept
    e = _make(org, dept, employee_code="A1")
    rows = AuditLog.objects.filter(entity="employees", entity_id=e.id, action="employee.created")
    assert rows.count() == 1


@pytest.mark.django_db
def test_employee_update_appends_audit_with_diff(org_dept) -> None:
    org, dept = org_dept
    e = _make(org, dept, employee_code="A2", role_title="Engineer")
    AuditLog.objects.all().delete()  # ignore the create row

    e.role_title = "Senior Engineer"
    e.save()

    row = AuditLog.objects.filter(entity_id=e.id, action="employee.updated").first()
    assert row is not None
    assert row.before["role_title"] == "Engineer"
    assert row.after["role_title"] == "Senior Engineer"


@pytest.mark.django_db
def test_employee_soft_delete_appends_audit(org_dept) -> None:
    org, dept = org_dept
    e = _make(org, dept, employee_code="A3")
    AuditLog.objects.all().delete()

    e.delete()

    row = AuditLog.objects.filter(entity_id=e.id, action="employee.archived").first()
    assert row is not None


@pytest.mark.django_db
def test_employee_unchanged_save_does_not_audit(org_dept) -> None:
    """If save() is called with no field changes, no audit row is written."""
    org, dept = org_dept
    e = _make(org, dept, employee_code="A4")
    AuditLog.objects.all().delete()

    e.save()  # no changes

    assert AuditLog.objects.filter(entity_id=e.id, action="employee.updated").count() == 0
