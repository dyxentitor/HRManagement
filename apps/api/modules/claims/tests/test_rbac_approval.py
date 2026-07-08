"""Permission-driven claims approval (v1.57.0): pool, enforcement, override, multi-role."""

import datetime
import os
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet

from common.workflow import Decision, NotAuthorizedToAct
from modules.claims.models import ClaimCategory, ClaimRequest
from modules.claims.services.claim_request import ClaimRequestService
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


def _role_with(org, code, *perms):
    role = Role.objects.create(org_id=org.id, code=code, name=code, is_system=False)
    for p in perms:
        perm, _ = Permission.objects.get_or_create(code=p, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=perm)
    return role


def _user_with(org, email, *perms, role_code=None):
    u = User.objects.create_user(email=email, password="x", org_id=org.id)  # pragma: allowlist secret
    if perms:
        UserRole.objects.create(user=u, role=_role_with(org, role_code or email, *perms), granted_by=None)
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


@pytest.fixture
def env():
    org = Organization.objects.create(
        name="X", slug="rbac", country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    cat = ClaimCategory.all_objects.create(
        org_id=org.id, code="MEAL", name="Meals", requires_attachment=False, currency_code="MYR"
    )
    return org, dept, cat


def _claim(org, cat, emp, amount="100"):
    c = ClaimRequest.all_objects.create(
        org_id=org.id, employee=emp, category=cat, amount=Decimal(amount),
        currency_code="MYR", expense_date=datetime.date(2026, 6, 1), description="x",
    )
    ClaimRequestService.submit(c, actor=emp.user)
    c.refresh_from_db()
    return c


@pytest.mark.django_db
def test_any_finance_holder_can_approve_pool_stage(env):
    org, dept, cat = env
    mgr_user = _user_with(org, "mgr@x.com", "claim:approve:team")
    _user_with(org, "fin1@x.com", "claim:approve:finance", role_code="finance")  # resolver's pick
    fin2 = _user_with(org, "fin2@x.com", "claim:approve:finance", role_code="finance2")
    mgr_emp = _emp(org, dept, "MGR", mgr_user)
    emp = _emp(org, dept, "EMP", _user_with(org, "emp@x.com"), manager=mgr_emp)

    claim = _claim(org, cat, emp)
    ClaimRequestService.act(claim, actor=mgr_user, decision=Decision.APPROVE)
    # fin2 is a pool member (not necessarily the resolved finance user) — may act.
    ClaimRequestService.act(claim, actor=fin2, decision=Decision.APPROVE)
    claim.refresh_from_db()
    assert claim.status == "finance_approved"


@pytest.mark.django_db
def test_team_only_user_cannot_finance_approve(env):
    org, dept, cat = env
    mgr_user = _user_with(org, "mgr@x.com", "claim:approve:team")
    team_only = _user_with(org, "t2@x.com", "claim:approve:team", role_code="team2")
    mgr_emp = _emp(org, dept, "MGR", mgr_user)
    emp = _emp(org, dept, "EMP", _user_with(org, "emp@x.com"), manager=mgr_emp)

    claim = _claim(org, cat, emp)
    ClaimRequestService.act(claim, actor=mgr_user, decision=Decision.APPROVE)  # L1 done
    with pytest.raises(NotAuthorizedToAct):
        ClaimRequestService.act(claim, actor=team_only, decision=Decision.APPROVE)  # L2 finance


@pytest.mark.django_db
def test_non_manager_cannot_approve_structural_stage(env):
    org, dept, cat = env
    mgr_user = _user_with(org, "mgr@x.com", "claim:approve:team")
    other = _user_with(org, "other@x.com", "claim:approve:team", role_code="other")  # has perm, not the manager
    mgr_emp = _emp(org, dept, "MGR", mgr_user)
    emp = _emp(org, dept, "EMP", _user_with(org, "emp@x.com"), manager=mgr_emp)

    claim = _claim(org, cat, emp)
    with pytest.raises(NotAuthorizedToAct):
        ClaimRequestService.act(claim, actor=other, decision=Decision.APPROVE)


@pytest.mark.django_db
def test_override_holder_can_act_on_any_stage(env):
    org, dept, cat = env
    mgr_user = _user_with(org, "mgr@x.com", "claim:approve:team")
    boss = _user_with(org, "boss@x.com", "claim:approve:override", role_code="admin")
    mgr_emp = _emp(org, dept, "MGR", mgr_user)
    emp = _emp(org, dept, "EMP", _user_with(org, "emp@x.com"), manager=mgr_emp)

    claim = _claim(org, cat, emp)
    # Override holder approves the manager stage without being the manager.
    ClaimRequestService.act(claim, actor=boss, decision=Decision.APPROVE)
    claim.refresh_from_db()
    assert claim.current_level == 2  # advanced past manager
    # ...and the finance stage too.
    ClaimRequestService.act(claim, actor=boss, decision=Decision.APPROVE)
    claim.refresh_from_db()
    assert claim.status == "finance_approved"


@pytest.mark.django_db
def test_multi_role_single_person_approves_both_stages(env):
    """Small-business case: one person is manager AND finance — one login, both stages."""
    org, dept, cat = env
    multi = _user_with(org, "multi@x.com", "claim:approve:team", "claim:approve:finance", role_code="hrfin")
    multi_emp = _emp(org, dept, "MULTI", multi)
    emp = _emp(org, dept, "EMP", _user_with(org, "emp@x.com"), manager=multi_emp)

    claim = _claim(org, cat, emp)
    ClaimRequestService.act(claim, actor=multi, decision=Decision.APPROVE)  # manager stage
    ClaimRequestService.act(claim, actor=multi, decision=Decision.APPROVE)  # finance stage
    claim.refresh_from_db()
    assert claim.status == "finance_approved"
