"""GET/PATCH /api/v1/employees/me — self-service profile."""

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
    return Department.all_objects.create(org_id=org.id, name="Engineering")


@pytest.fixture
def employee_with_user(org: Organization, dept: Department) -> tuple[User, Employee, APIClient]:
    user = User.objects.create_user(
        email="emp@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)
    for code in ("employee:read:self", "employee:write:self"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    emp = Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code="PVT-200",
        first_name="Aminah",
        last_name="binti Ali",
        email="emp@x.com",
        phone="+60111",
        date_of_birth=datetime.date(1990, 1, 1),
        gender="female",
        nationality="MY",
        marital_status="single",
        address_line1="x",
        city="x",
        state="x",
        postcode="00000",
        country_code="MY",
        department=dept,
        role_title="Engineer",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        bank_name="Maybank",
        emergency_contact_name="Mom",
        emergency_contact_relationship="mother",
        emergency_contact_phone="+60112",
    )

    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": "emp@x.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    return user, emp, client


@pytest.mark.django_db
def test_get_me_returns_own_profile(employee_with_user) -> None:
    _, emp, client = employee_with_user
    resp = client.get("/api/v1/employees/me/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["employee_code"] == emp.employee_code
    assert body["full_name"]


@pytest.mark.django_db
def test_patch_me_can_edit_whitelisted_fields(employee_with_user) -> None:
    _, emp, client = employee_with_user
    resp = client.patch(
        "/api/v1/employees/me/",
        {"phone": "+60999999", "address_line1": "New Address"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    emp.refresh_from_db()
    assert emp.phone == "+60999999"
    assert emp.address_line1 == "New Address"


@pytest.mark.django_db
def test_patch_me_cannot_edit_role_title(employee_with_user) -> None:
    """role_title is HR-only. Self-edit attempts silently ignored (DRF read_only)."""
    _, emp, client = employee_with_user
    resp = client.patch(
        "/api/v1/employees/me/",
        {"role_title": "CEO"},
        format="json",
    )
    assert resp.status_code == 200
    emp.refresh_from_db()
    assert emp.role_title == "Engineer"  # unchanged


@pytest.mark.django_db
def test_patch_me_cannot_edit_employee_code(employee_with_user) -> None:
    _, emp, client = employee_with_user
    resp = client.patch(
        "/api/v1/employees/me/",
        {"employee_code": "TAMPER-001"},
        format="json",
    )
    assert resp.status_code == 200
    emp.refresh_from_db()
    assert emp.employee_code == "PVT-200"


@pytest.mark.django_db
def test_get_me_when_no_employee_profile(org: Organization) -> None:
    user = User.objects.create_user(
        email="solo@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)
    p, _ = Permission.objects.get_or_create(code="employee:read:self", defaults={"description": ""})
    RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)

    client = APIClient()
    login = client.post(
        "/api/v1/auth/login",
        {"email": "solo@x.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access_token']}")
    resp = client.get("/api/v1/employees/me/")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_me_get_includes_photo_url_null_when_no_photo(employee_with_user) -> None:
    """v1.7.0: GET /me/ returns photo_url. Null when photo_s3_key is empty."""
    _, _emp, client = employee_with_user
    resp = client.get("/api/v1/employees/me/")
    assert resp.status_code == 200
    body = resp.json()
    assert "photo_url" in body
    assert body["photo_url"] is None


@pytest.mark.django_db
def test_patch_me_can_edit_personal_details(employee_with_user) -> None:
    """gender / date_of_birth / nationality / marital_status are now self-editable."""
    _, emp, client = employee_with_user
    resp = client.patch(
        "/api/v1/employees/me/",
        {
            "gender": "male",
            "date_of_birth": "1988-03-09",
            "nationality": "SG",
            "marital_status": "married",
        },
        format="json",
    )
    assert resp.status_code == 200, resp.content
    emp.refresh_from_db()
    assert emp.gender == "male"
    assert emp.date_of_birth == datetime.date(1988, 3, 9)
    assert emp.nationality == "SG"
    assert emp.marital_status == "married"


@pytest.mark.django_db
def test_patch_me_can_set_own_ic_without_mfa(employee_with_user) -> None:
    """IC is self-editable (no MFA gate) so employees can complete their own IC."""
    _, emp, client = employee_with_user
    resp = client.patch(
        "/api/v1/employees/me/",
        {"ic_number": "900101-14-5523"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    emp.refresh_from_db()
    assert emp.ic_number == "900101-14-5523"
    # last-4 surfaces in the read view; the raw number stays write-only
    assert resp.json()["ic_last4"] == "5523"
    assert "ic_number" not in resp.json()


@pytest.mark.django_db
def test_patch_me_rejects_invalid_gender(employee_with_user) -> None:
    """Model choices still validate — a bad gender is a 400, not a silent write."""
    _, emp, client = employee_with_user
    resp = client.patch(
        "/api/v1/employees/me/",
        {"gender": "notachoice"},
        format="json",
    )
    assert resp.status_code == 400
    emp.refresh_from_db()
    assert emp.gender == "female"  # unchanged
