"""Pool visibility: a finance-stage claim appears for ALL finance-perm holders."""

import datetime
import os
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet

from common.workflow import Decision
from modules.claims.models import ClaimCategory, ClaimRequest
from modules.claims.services.claim_request import ClaimRequestService
from modules.dashboard.services.inbox import get_inbox
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
        manager=manager, role_title="x", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), emergency_contact_name="x",
        emergency_contact_relationship="x", emergency_contact_phone="+1",
    )


@pytest.mark.django_db
def test_finance_pool_claim_visible_to_all_finance_holders():
    org = Organization.objects.create(
        name="X", slug="pool", country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    cat = ClaimCategory.all_objects.create(
        org_id=org.id, code="MEAL", name="Meals", requires_attachment=False, currency_code="MYR"
    )
    mgr = _user(org, "mgr@x.com", "claim:approve:team")
    _user(org, "fin1@x.com", "claim:approve:finance")  # resolver's structural pick
    fin2 = _user(org, "fin2@x.com", "claim:approve:finance")  # another pool member
    outsider = _user(org, "nobody@x.com")  # no perms
    mgr_emp = _emp(org, dept, "MGR", mgr)
    emp = _emp(org, dept, "EMP", _user(org, "emp@x.com"), manager=mgr_emp)

    claim = ClaimRequest.all_objects.create(
        org_id=org.id, employee=emp, category=cat, amount=Decimal("100"),
        currency_code="MYR", expense_date=datetime.date(2026, 6, 1), description="x",
    )
    ClaimRequestService.submit(claim, actor=emp.user)
    ClaimRequestService.act(claim, actor=mgr, decision=Decision.APPROVE)  # now at finance stage

    fin2_ids = {i.id for i in get_inbox(user=fin2) if i.kind == "claim"}
    assert str(claim.id) in fin2_ids  # pool member sees it though not the resolved approver

    outsider_ids = {i.id for i in get_inbox(user=outsider) if i.kind == "claim"}
    assert str(claim.id) not in outsider_ids  # no permission → not visible
