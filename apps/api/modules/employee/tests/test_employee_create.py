"""Progressive employee creation — only the 7 essentials are mandatory."""

import os
from collections.abc import Iterator

import pytest
from cryptography.fernet import Fernet

from common.managers import clear_current_org_id, set_current_org_id
from modules.employee.serializers import EmployeeSerializer
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
    # Scope the current thread to this org so the serializer's department PK
    # lookup (TenantScopedManager) can see the row.
    set_current_org_id(org.id)
    try:
        yield Department.all_objects.create(org_id=org.id, name="Operations")
    finally:
        clear_current_org_id()


@pytest.mark.django_db
def test_minimal_fields_serializer_valid(dept: Department) -> None:
    data = {
        "employee_code": "E-1",
        "first_name": "Ada",
        "last_name": "Lovelace",
        "email": "ada@x.co",
        "hire_date": "2026-01-01",
        "department": str(dept.id),
        "employment_type": "fulltime",
    }
    ser = EmployeeSerializer(data=data)
    assert ser.is_valid(), ser.errors


@pytest.mark.django_db
def test_missing_mandatory_field_invalid(dept: Department) -> None:
    data = {  # missing employee_code
        "first_name": "Ada",
        "last_name": "L",
        "email": "a@x.co",
        "hire_date": "2026-01-01",
        "department": str(dept.id),
        "employment_type": "fulltime",
    }
    ser = EmployeeSerializer(data=data)
    assert not ser.is_valid()
    assert "employee_code" in ser.errors
