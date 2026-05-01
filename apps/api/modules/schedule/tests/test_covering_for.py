"""Tests for ShiftAssignment.covering_for FK + self-reference rejection."""

from __future__ import annotations

import datetime as dt
import os
import uuid

import pytest
from cryptography.fernet import Fernet
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from common.managers import set_current_org_id
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization
from modules.schedule.models import Shift, ShiftAssignment

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Provide a Fernet key for EncryptedCharField."""
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


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
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    e1 = Employee.all_objects.create(
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
        department=dept,
        hire_date="2024-01-01",
        employment_type="fulltime",
        role_title="Engineer",
        status="active",
        bank_name="X",
        emergency_contact_name="X",
        emergency_contact_relationship="self",
        emergency_contact_phone="+60100000099",
    )
    e2 = Employee.all_objects.create(
        org_id=org.id,
        employee_code="E2",
        first_name="C",
        last_name="D",
        email="c@d.com",
        phone="+60100000001",
        date_of_birth="1990-01-01",
        gender="other",
        nationality="MY",
        marital_status="single",
        address_line1="x",
        city="KL",
        state="KL",
        postcode="50000",
        country_code="MY",
        department=dept,
        hire_date="2024-01-01",
        employment_type="fulltime",
        role_title="Engineer",
        status="active",
        bank_name="X",
        emergency_contact_name="X",
        emergency_contact_relationship="self",
        emergency_contact_phone="+60100000098",
    )
    s = Shift.all_objects.create(
        org_id=org.id,
        name="Morning",
        start_time="09:00",
        end_time="18:00",
        code="M",
    )
    return org, e1, e2, s


def test_covering_for_nullable_default(setup):
    org, e1, _, s = setup
    a = ShiftAssignment.all_objects.create(
        org_id=org.id,
        employee=e1,
        shift=s,
        work_date=dt.date(2026, 3, 4),
        assigned_by=uuid.uuid4(),
    )
    assert a.covering_for is None


def test_covering_for_set_to_other_employee(setup):
    org, e1, e2, s = setup
    a = ShiftAssignment.all_objects.create(
        org_id=org.id,
        employee=e1,
        shift=s,
        work_date=dt.date(2026, 3, 4),
        assigned_by=uuid.uuid4(),
        covering_for=e2,
    )
    assert a.covering_for == e2


def test_covering_for_self_reference_rejected(setup):
    """Employee covering for themselves is meaningless — model.clean() blocks."""
    org, e1, _, s = setup
    a = ShiftAssignment(
        org_id=org.id,
        employee=e1,
        shift=s,
        work_date=dt.date(2026, 3, 4),
        assigned_by=uuid.uuid4(),
        covering_for=e1,
    )
    with pytest.raises(ValidationError):
        a.full_clean()


def test_covering_for_self_reference_rejected_on_save(setup):
    """ORM .save() path also enforces the invariant (mirrors Employee.manager)."""
    org, e1, _, s = setup
    a = ShiftAssignment(
        org_id=org.id,
        employee=e1,
        shift=s,
        work_date=dt.date(2026, 3, 5),
        assigned_by=uuid.uuid4(),
        covering_for=e1,
    )
    with pytest.raises(ValidationError):
        a.save()


def test_covering_for_set_null_on_employee_hard_delete(setup):
    """SET_NULL fires only on hard delete (TenantBaseModel.delete is soft)."""
    org, e1, e2, s = setup
    a = ShiftAssignment.all_objects.create(
        org_id=org.id,
        employee=e1,
        shift=s,
        work_date=dt.date(2026, 3, 4),
        assigned_by=uuid.uuid4(),
        covering_for=e2,
    )
    e2.hard_delete()
    a.refresh_from_db()
    assert a.covering_for is None


def test_employee_full_name_property_uses_preferred(setup):
    """Employee.full_name prefers preferred_name when set, otherwise first_name."""
    _, e1, _, _ = setup
    # No preferred_name set
    assert e1.full_name == "A B"
    # With preferred_name
    e1.preferred_name = "Aleks"
    assert e1.full_name == "Aleks B"


@pytest.mark.django_db
def test_covering_for_name_renders_via_api():
    """Endpoint test: GET /api/v1/schedule/shift-assignments/ returns covering_for_name.

    Regression guard for B1 — ShiftAssignmentSerializer.get_covering_for_name
    relies on Employee.full_name; this is the test that would have caught
    AttributeError if the property went missing.
    """
    org = Organization.objects.create(
        slug="acme-api",
        name="Acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
        status="active",
    )
    set_current_org_id(org.id)
    dept = Department.all_objects.create(org_id=org.id, name="Eng")

    mgr_user = User.objects.create_user(
        email="m2@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    mgr_role = Role.objects.create(org_id=org.id, code="manager", name="Manager", is_system=True)
    p, _ = Permission.objects.get_or_create(
        code="schedule:assignment:read:team", defaults={"description": ""}
    )
    RolePermission.objects.create(role=mgr_role, permission=p)
    UserRole.objects.create(user=mgr_user, role=mgr_role, granted_by=None)

    def _emp(code, **kwargs):
        return Employee.all_objects.create(
            org_id=org.id,
            employee_code=code,
            first_name=kwargs.get("first_name", code),
            last_name=kwargs.get("last_name", "Doe"),
            preferred_name=kwargs.get("preferred_name", ""),
            email=f"{code}@x.com",
            phone="+1",
            date_of_birth=dt.date(1985, 1, 1),
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
            hire_date=dt.date(2024, 1, 1),
            bank_name="x",
            emergency_contact_name="x",
            emergency_contact_relationship="x",
            emergency_contact_phone="+1",
        )

    e1 = _emp("E1", first_name="Alice", last_name="Smith")
    e2 = _emp("E2", first_name="Bob", last_name="Jones", preferred_name="Bobby")

    s = Shift.all_objects.create(
        org_id=org.id,
        name="Morning",
        code="M",
        start_time=dt.time(9, 0),
        end_time=dt.time(18, 0),
        crosses_midnight=False,
    )
    ShiftAssignment.all_objects.create(
        org_id=org.id,
        employee=e1,
        shift=s,
        work_date=dt.date(2026, 3, 4),
        assigned_by=uuid.uuid4(),
        covering_for=e2,
    )

    client = APIClient()
    body = client.post(
        "/api/v1/auth/login",
        {"email": "m2@x.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access_token']}")

    resp = client.get(
        "/api/v1/schedule/shift-assignments/" f"?employee_id={e1.id}&from=2026-03-01&to=2026-03-31"
    )
    assert resp.status_code == 200, resp.content
    rows = resp.json()
    # Pagination wrapper or raw list — handle both
    if isinstance(rows, dict) and "results" in rows:
        rows = rows["results"]
    assert len(rows) == 1
    assert rows[0]["covering_for_name"] == "Bobby Jones"
