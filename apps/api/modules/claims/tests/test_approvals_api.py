"""Claims Approvals endpoints — /claims/approvals/ + /claims/approvals/summary/."""

import datetime
import os
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.claims.models import ClaimCategory, ClaimRequest
from modules.claims.services.claim_request import ClaimRequestService
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


def _org():
    return Organization.objects.create(
        name="X", slug="api", country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )


def _client(org, email, *perms):
    u = User.objects.create_user(email=email, password="x", org_id=org.id)  # pragma: allowlist secret
    if perms:
        role = Role.objects.create(org_id=org.id, code=email, name=email, is_system=False)
        for p in perms:
            perm, _ = Permission.objects.get_or_create(code=p, defaults={"description": ""})
            RolePermission.objects.create(role=role, permission=perm)
        UserRole.objects.create(user=u, role=role, granted_by=None)
    c = APIClient()
    body = c.post("/api/v1/auth/login", {"email": email, "password": "x"}, format="json").json()  # pragma: allowlist secret
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access_token']}")
    return c, u


def _emp(org, dept, code, user, manager=None):
    return Employee.all_objects.create(
        org_id=org.id, user=user, employee_code=code, first_name=code, last_name="x",
        email=f"{code}@x.com", phone="+1", date_of_birth=datetime.date(1985, 1, 1),
        gender="other", nationality="MY", marital_status="single", address_line1="x",
        city="x", state="x", postcode="00000", country_code="MY", department=dept,
        manager=manager, role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), emergency_contact_name="x",
        emergency_contact_relationship="x", emergency_contact_phone="+1",
    )


@pytest.mark.django_db
def test_approvals_endpoints_for_approver():
    org = _org()
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    cat = ClaimCategory.all_objects.create(
        org_id=org.id, code="M", name="Meals", requires_attachment=False, currency_code="MYR"
    )
    client, mgr = _client(org, "mgr@x.com", "claim:approve:team")
    mgr_emp = _emp(org, dept, "MGR", mgr)
    emp = _emp(org, dept, "EMP", User.objects.create_user(email="e@x.com", password="x", org_id=org.id), manager=mgr_emp)  # pragma: allowlist secret
    claim = ClaimRequest.all_objects.create(
        org_id=org.id, employee=emp, category=cat, amount=Decimal("100"),
        currency_code="MYR", expense_date=datetime.date(2026, 6, 1),
    )
    ClaimRequestService.submit(claim, actor=emp.user)

    resp = client.get("/api/v1/claims/approvals/?tab=awaiting")
    assert resp.status_code == 200
    assert str(claim.id) in {r["id"] for r in resp.json()}

    summary = client.get("/api/v1/claims/approvals/summary/")
    assert summary.status_code == 200
    assert summary.json()["awaiting_count"] == 1


@pytest.mark.django_db
def test_approvals_requires_approver_perm():
    org = _org()
    client, _ = _client(org, "nobody@x.com", "claim:read:self")
    assert client.get("/api/v1/claims/approvals/").status_code == 403
    assert client.get("/api/v1/claims/approvals/summary/").status_code == 403
