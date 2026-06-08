"""Profile completeness — computed field for the partial-fill HR workflow."""

import os
from collections.abc import Iterator

import pytest
from cryptography.fernet import Fernet

from common.managers import clear_current_org_id, set_current_org_id
from modules.employee.models import Employee
from modules.employee.serializers import EmployeeSerializer
from modules.employee.services.completeness import profile_completeness
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="Provintell",
        slug="provintell",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def dept(org: Organization) -> Iterator[Department]:
    set_current_org_id(org.id)
    try:
        yield Department.all_objects.create(org_id=org.id, name="Operations")
    finally:
        clear_current_org_id()


def _minimal_employee(org: Organization, dept: Department) -> Employee:
    """The 7 mandatory fields and nothing else."""
    return Employee.all_objects.create(
        org_id=org.id,
        employee_code="E-1",
        first_name="Ada",
        last_name="Lovelace",
        email="ada@x.co",
        hire_date="2026-01-01",
        department=dept,
        employment_type="fulltime",
    )


@pytest.mark.django_db
def test_minimal_employee_incomplete(org: Organization, dept: Department) -> None:
    emp = _minimal_employee(org, dept)
    result = profile_completeness(emp)
    assert result["percent"] < 100
    missing = result["missing"]
    assert "bank_details" in missing
    assert "emergency_contact" in missing
    assert "personal" in missing


@pytest.mark.django_db
def test_fully_filled_employee_100(org: Organization, dept: Department) -> None:
    emp = Employee.all_objects.create(
        org_id=org.id,
        employee_code="E-2",
        first_name="Grace",
        last_name="Hopper",
        email="grace@x.co",
        hire_date="2026-01-01",
        department=dept,
        employment_type="fulltime",
        # contact
        phone="+60123456789",
        # personal
        date_of_birth="1990-01-01",
        gender="female",
        nationality="MY",
        marital_status="single",
        # address
        address_line1="1 Jalan Test",
        city="Kuala Lumpur",
        state="WP",
        postcode="50000",
        country_code="MY",
        # emergency contact
        emergency_contact_name="Jane Doe",
        emergency_contact_relationship="sibling",
        emergency_contact_phone="+60198765432",
        # bank
        bank_name="Maybank",
        bank_account_number="1234567890",
        # tax ids
        lhdn_tax_no="SG123",
        epf_no="EPF123",
        socso_no="SOCSO123",
        eis_no="EIS123",
    )
    result = profile_completeness(emp)
    assert result["percent"] == 100
    assert result["missing"] == []


@pytest.mark.django_db
def test_serializer_includes_completeness(org: Organization, dept: Department) -> None:
    emp = _minimal_employee(org, dept)
    data = EmployeeSerializer(emp).data
    assert "profile_completeness" in data
    assert data["profile_completeness"]["percent"] < 100
