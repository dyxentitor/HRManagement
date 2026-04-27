"""Bank field PATCHes via /me require fresh MFA."""

import datetime
import os

import pyotp
import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import (
    MFADevice,
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.fixture
def setup():
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    user = User.objects.create_user(
        email="emp@x.com", password="x", org_id=org.id, mfa_enabled=True
    )  # pragma: allowlist secret
    secret = pyotp.random_base32()
    MFADevice.objects.create(
        user=user, secret=secret, confirmed_at=datetime.datetime.now(datetime.UTC)
    )
    role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)
    for code in ("employee:read:self", "employee:write:self"):
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    emp = Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code="E1",
        first_name="A",
        last_name="B",
        email="emp@x.com",
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
        role_title="Engineer",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        bank_name="OldBank",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )

    client = APIClient()

    # Login: receives mfa_required=true + mfa_token
    body = client.post(
        "/api/v1/auth/login", {"email": "emp@x.com", "password": "x"}, format="json"
    ).json()  # pragma: allowlist secret
    # Complete MFA login step
    code = pyotp.TOTP(secret).now()
    body = client.post(
        "/api/v1/auth/login/mfa", {"mfa_token": body["mfa_token"], "code": code}, format="json"
    ).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access_token']}")
    return client, user, secret, emp


@pytest.mark.django_db
def test_bank_patch_without_mfa_header_rejected(setup) -> None:
    client, _, _, _ = setup
    resp = client.patch("/api/v1/employees/me/", {"bank_name": "NewBank"}, format="json")
    assert resp.status_code == 400
    assert "mfa" in str(resp.content).lower()


@pytest.mark.django_db
def test_bank_patch_with_valid_mfa_header_accepted(setup) -> None:
    client, _, secret, emp = setup
    code = pyotp.TOTP(secret).now()
    resp = client.patch(
        "/api/v1/employees/me/",
        {"bank_name": "NewBank"},
        format="json",
        HTTP_X_MFA_CODE=code,
    )
    assert resp.status_code == 200
    emp.refresh_from_db()
    assert emp.bank_name == "NewBank"


@pytest.mark.django_db
def test_bank_patch_with_invalid_mfa_header_rejected(setup) -> None:
    client, _, _, _ = setup
    resp = client.patch(
        "/api/v1/employees/me/",
        {"bank_name": "NewBank"},
        format="json",
        HTTP_X_MFA_CODE="000000",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_non_bank_patch_does_not_require_mfa(setup) -> None:
    client, _, _, emp = setup
    resp = client.patch("/api/v1/employees/me/", {"phone": "+60999"}, format="json")
    assert resp.status_code == 200
    emp.refresh_from_db()
    assert emp.phone == "+60999"
