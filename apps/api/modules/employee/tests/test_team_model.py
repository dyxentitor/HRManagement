"""Tests for the Team model and Employee.team FK."""

from __future__ import annotations

import datetime
import os

import pytest
from cryptography.fernet import Fernet
from django.db import IntegrityError

from common.managers import clear_current_org_id, set_current_org_id
from modules.employee.models import Employee, Team
from modules.organization.models import Department, Organization

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Provide a Fernet key for EncryptedCharField."""
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        slug="acme",
        name="Acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
        status="active",
    )


@pytest.fixture
def dept(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Operations")


@pytest.fixture(autouse=True)
def _clear_org_after_test():
    yield
    clear_current_org_id()


def _make_employee(*, org_id, dept, code: str, email: str, phone: str, **overrides) -> Employee:
    """Create an Employee with all required fields populated."""
    defaults = {
        "org_id": org_id,
        "employee_code": code,
        "first_name": "A",
        "last_name": "B",
        "email": email,
        "phone": phone,
        "date_of_birth": datetime.date(1990, 1, 1),
        "gender": "other",
        "nationality": "MY",
        "marital_status": "single",
        "address_line1": "x",
        "city": "KL",
        "state": "KL",
        "postcode": "50000",
        "country_code": "MY",
        "department": dept,
        "role_title": "Engineer",
        "employment_type": "fulltime",
        "hire_date": datetime.date(2024, 1, 1),
        "bank_name": "Maybank",
        "emergency_contact_name": "X",
        "emergency_contact_relationship": "father",
        "emergency_contact_phone": phone,
        "status": "active",
    }
    defaults.update(overrides)
    return Employee.all_objects.create(**defaults)


def test_team_create_and_retrieve(org):
    set_current_org_id(org.id)
    t = Team.all_objects.create(org_id=org.id, name="Team Alpha", sort_order=1)
    assert Team.all_objects.get(pk=t.pk).name == "Team Alpha"


def test_team_unique_name_per_org(org):
    set_current_org_id(org.id)
    Team.all_objects.create(org_id=org.id, name="Ops", sort_order=0)
    with pytest.raises(IntegrityError):
        Team.all_objects.create(org_id=org.id, name="Ops", sort_order=1)


def test_team_parent_nesting(org):
    set_current_org_id(org.id)
    parent = Team.all_objects.create(org_id=org.id, name="Standby", sort_order=0)
    child = Team.all_objects.create(
        org_id=org.id,
        name="L2 CyberLAB",
        parent_team=parent,
        sort_order=1,
    )
    assert child.parent_team == parent
    assert list(parent.children.all()) == [child]


def test_team_min_headcount_nullable(org):
    set_current_org_id(org.id)
    t = Team.all_objects.create(org_id=org.id, name="Focus", sort_order=0)
    assert t.min_headcount is None
    t.min_headcount = 2
    t.save()
    assert Team.all_objects.get(pk=t.pk).min_headcount == 2


def test_employee_team_nullable_default(org, dept):
    set_current_org_id(org.id)
    emp = _make_employee(
        org_id=org.id,
        dept=dept,
        code="E1",
        email="a@b.com",
        phone="+60100000000",
    )
    assert emp.team is None


def test_employee_team_set_null_on_delete(org, dept):
    set_current_org_id(org.id)
    t = Team.all_objects.create(org_id=org.id, name="T1", sort_order=0)
    emp = _make_employee(
        org_id=org.id,
        dept=dept,
        code="E2",
        email="c@d.com",
        phone="+60100000001",
        team=t,
    )
    # Soft delete (the default) only stamps deleted_at; the FK row remains, so SET_NULL
    # never fires. Use hard_delete to verify the DB-level ON DELETE SET NULL constraint.
    t.hard_delete()
    emp.refresh_from_db()
    assert emp.team is None
