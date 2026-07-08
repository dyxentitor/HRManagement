"""Claims Approvals queue service — list tabs + summary."""

import datetime
import os
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet

from common.workflow import Decision
from modules.claims.models import ClaimCategory, ClaimRequest
from modules.claims.services.approvals_queue import list_for_approver, summary_for_approver
from modules.claims.services.claim_request import ClaimRequestService
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


def _user(org, email, *perms):
    u = User.objects.create_user(email=email, password="x", org_id=org.id)  # pragma: allowlist secret
    if perms:
        role = Role.objects.create(org_id=org.id, code=email, name=email, is_system=False)
        for p in perms:
            perm, _ = Permission.objects.get_or_create(code=p, defaults={"description": ""})
            RolePermission.objects.create(role=role, permission=perm)
        UserRole.objects.create(user=u, role=role, granted_by=None)
    return u


def _emp(org, dept, code, user, manager=None):
    return Employee.all_objects.create(
        org_id=org.id, user=user, employee_code=code, first_name=code, last_name="x",
        email=f"{code}@x.com", phone="+1", date_of_birth=datetime.date(1985, 1, 1),
        gender="other", nationality="MY", marital_status="single", address_line1="x",
        city="x", state="x", postcode="00000", country_code="MY", department=dept,
        manager=manager, role_title="Engineer", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), emergency_contact_name="x",
        emergency_contact_relationship="x", emergency_contact_phone="+1",
    )


@pytest.fixture
def env():
    org = Organization.objects.create(
        name="X", slug="q", country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    cat = ClaimCategory.all_objects.create(
        org_id=org.id, code="M", name="Meals", requires_attachment=False, currency_code="MYR"
    )
    return org, dept, cat


@pytest.mark.django_db
def test_awaiting_tab_and_summary(env):
    org, dept, cat = env
    mgr = _user(org, "mgr@x.com", "claim:approve:team")
    mgr_emp = _emp(org, dept, "MGR", mgr)
    emp = _emp(org, dept, "EMP", _user(org, "emp@x.com"), manager=mgr_emp)
    small = ClaimRequest.all_objects.create(
        org_id=org.id, employee=emp, category=cat, amount=Decimal("100"),
        currency_code="MYR", expense_date=datetime.date(2026, 6, 1), merchant="Grab",
    )
    big = ClaimRequest.all_objects.create(
        org_id=org.id, employee=emp, category=cat, amount=Decimal("7000"),
        currency_code="MYR", expense_date=datetime.date(2026, 6, 1), merchant="Apple",
    )
    ClaimRequestService.submit(small, actor=emp.user)
    ClaimRequestService.submit(big, actor=emp.user)

    rows = list_for_approver(mgr, "awaiting")
    assert {r["id"] for r in rows} == {str(small.id), str(big.id)}
    big_row = next(r for r in rows if r["id"] == str(big.id))
    assert big_row["is_high_value"] is True
    assert big_row["employee_name"] == "EMP x"
    assert big_row["category_name"] == "Meals"
    assert big_row["stage_label"] == "Manager"

    s = summary_for_approver(mgr)
    assert s["awaiting_count"] == 2
    assert s["pending_value"] == "7100.00"
    assert s["high_value_count"] == 1
    assert s["approved_this_week"] == 0


@pytest.mark.django_db
def test_approved_tab(env):
    org, dept, cat = env
    mgr = _user(org, "mgr@x.com", "claim:approve:team")
    mgr_emp = _emp(org, dept, "MGR", mgr)
    emp = _emp(org, dept, "EMP", _user(org, "emp@x.com"), manager=mgr_emp)
    claim = ClaimRequest.all_objects.create(
        org_id=org.id, employee=emp, category=cat, amount=Decimal("100"),
        currency_code="MYR", expense_date=datetime.date(2026, 6, 1),
    )
    ClaimRequestService.submit(claim, actor=emp.user)
    ClaimRequestService.act(claim, actor=mgr, decision=Decision.APPROVE)

    approved = list_for_approver(mgr, "approved")
    assert str(claim.id) in {r["id"] for r in approved}
    assert summary_for_approver(mgr)["approved_this_week"] == 1
    # It's no longer awaiting the manager (advanced to finance pool).
    assert str(claim.id) not in {r["id"] for r in list_for_approver(mgr, "awaiting")}
