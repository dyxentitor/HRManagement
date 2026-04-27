"""Employee model basics: required fields, uniqueness, encryption, soft-delete."""

import datetime
import os
import uuid

import pytest
from cryptography.fernet import Fernet
from django.db import IntegrityError

from modules.employee.models import Employee
from modules.identity.models import User
from modules.organization.models import Department, Organization


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
        name="Provintell",
        slug="provintell",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def dept(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Operations")


@pytest.mark.django_db
def test_employee_minimal_create(org: Organization, dept: Department) -> None:
    e = Employee.all_objects.create(
        org_id=org.id,
        employee_code="PVT-001",
        first_name="Aminah",
        last_name="binti Ali",
        email="aminah@provintell.local",
        phone="+60123456789",
        date_of_birth=datetime.date(1990, 1, 1),
        gender="female",
        nationality="MY",
        marital_status="single",
        address_line1="1 Jalan Provintell",
        city="Petaling Jaya",
        state="Selangor",
        postcode="46050",
        country_code="MY",
        department=dept,
        role_title="SOC Analyst",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 6, 1),
        bank_name="Maybank",
        emergency_contact_name="Ali bin Ahmad",
        emergency_contact_relationship="father",
        emergency_contact_phone="+60123456788",
    )
    assert isinstance(e.id, uuid.UUID)
    assert e.org_id == org.id
    assert e.status == "active"
    assert e.schedule_type == "fixed"


@pytest.mark.django_db
def test_employee_code_unique_per_org(org: Organization, dept: Department) -> None:
    Employee.all_objects.create(
        org_id=org.id,
        employee_code="PVT-001",
        first_name="A",
        last_name="B",
        email="a@x.com",
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
    with pytest.raises(IntegrityError):
        Employee.all_objects.create(
            org_id=org.id,
            employee_code="PVT-001",
            first_name="C",
            last_name="D",
            email="c@x.com",
            phone="+2",
            date_of_birth=datetime.date(1991, 1, 1),
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
            emergency_contact_phone="+2",
        )


@pytest.mark.django_db
def test_employee_ic_encrypted_at_rest(org: Organization, dept: Department) -> None:
    """Setting ic_number stores ciphertext at the DB level; reading roundtrips to plaintext."""
    from django.db import connection

    e = Employee.all_objects.create(
        org_id=org.id,
        employee_code="PVT-002",
        first_name="A",
        last_name="B",
        email="a2@x.com",
        phone="+1",
        ic_number="900101-14-1234",
        ic_last4="1234",
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
    e.refresh_from_db()
    assert e.ic_number == "900101-14-1234"
    assert e.ic_last4 == "1234"

    # Verify ciphertext at the DB level.
    # SQLite stores UUIDs without hyphens; Postgres stores them as uuid type.
    # Query without the pk filter to avoid dialect differences — there's only one row.
    with connection.cursor() as cur:
        cur.execute(
            "SELECT ic_number FROM employee_employee WHERE employee_code = %s",
            ["PVT-002"],
        )
        raw = cur.fetchone()[0]
    if isinstance(raw, memoryview):
        raw = bytes(raw)
    if isinstance(raw, bytes):
        raw = raw.decode("ascii", errors="replace")
    assert raw.startswith("gAAAAA")  # Fernet token prefix


@pytest.mark.django_db
def test_employee_self_manager_protected(org: Organization, dept: Department) -> None:
    """An employee cannot have themselves as manager."""
    e = Employee.all_objects.create(
        org_id=org.id,
        employee_code="PVT-003",
        first_name="A",
        last_name="B",
        email="a3@x.com",
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
    e.manager_id = e.id
    with pytest.raises(Exception):
        e.save()


@pytest.mark.django_db
def test_employee_soft_delete(org: Organization, dept: Department) -> None:
    e = Employee.all_objects.create(
        org_id=org.id,
        employee_code="PVT-004",
        first_name="A",
        last_name="B",
        email="a4@x.com",
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
    e.delete()
    e.refresh_from_db()
    assert e.deleted_at is not None
    # `all_objects` still sees it
    assert Employee.all_objects.filter(pk=e.pk).count() == 1


@pytest.mark.django_db
def test_employee_link_to_user(org: Organization, dept: Department) -> None:
    """Employee can be linked to a User; each Employee has at most one User."""
    user = User.objects.create_user(
        email="x@example.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    e = Employee.all_objects.create(
        org_id=org.id,
        employee_code="PVT-005",
        user=user,
        first_name="A",
        last_name="B",
        email="x@example.com",
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
    assert e.user_id == user.id
