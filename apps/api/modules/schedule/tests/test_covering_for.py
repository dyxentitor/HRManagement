"""Tests for ShiftAssignment.covering_for FK + self-reference rejection."""

from __future__ import annotations

import datetime as dt
import os
import uuid

import pytest
from cryptography.fernet import Fernet
from django.core.exceptions import ValidationError

from common.managers import set_current_org_id
from modules.employee.models import Employee
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
