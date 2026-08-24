"""Claim signals must bind the CC context tokens their registry entries declare."""

import datetime
import os
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet

from common.workflow import Decision
from modules.claims.models import ClaimCategory, ClaimRequest
from modules.claims.services.claim_request import ClaimRequestService
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.notification.models import Notification
from modules.organization.models import Department, Organization

pytestmark = pytest.mark.django_db


def _grant(role, *codes):
    """Attach permission codes to a role (creating Permission rows as needed)."""
    for code in codes:
        perm, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=perm)


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY",
            Fernet.generate_key().decode(),  # pragma: allowlist secret
        )


@pytest.fixture
def _stack():
    """Org + a 2-step claim chain (manager -> finance). Mirrors
    modules/claims/tests/test_workflow_integration.py::stack.
    """
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")

    mgr_user = User.objects.create_user(
        email="mgr@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    fin_user = User.objects.create_user(
        email="fin@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    employee_user = User.objects.create_user(
        email="emp@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )

    fin_role = Role.objects.create(org_id=org.id, code="finance", name="Finance", is_system=True)
    _grant(fin_role, "claim:approve:finance")
    UserRole.objects.create(user=fin_user, role=fin_role, granted_by=None)

    mgr_role = Role.objects.create(org_id=org.id, code="manager", name="Manager", is_system=True)
    _grant(mgr_role, "claim:approve:team")
    UserRole.objects.create(user=mgr_user, role=mgr_role, granted_by=None)

    def _emp(code, user, manager=None):
        return Employee.all_objects.create(
            org_id=org.id,
            user=user,
            employee_code=code,
            first_name=code,
            last_name="x",
            email=f"{code}@x.com",
            phone="+1",
            date_of_birth=datetime.date(1985, 1, 1),
            gender="other",
            nationality="MY",
            marital_status="single",
            address_line1="x",
            city="x",
            state="x",
            postcode="00000",
            country_code="MY",
            department=dept,
            manager=manager,
            role_title="x",
            employment_type="fulltime",
            hire_date=datetime.date(2024, 1, 1),
            bank_name="x",
            emergency_contact_name="x",
            emergency_contact_relationship="x",
            emergency_contact_phone="+1",
        )

    mgr_emp = _emp("MGR", mgr_user)
    _emp("FIN", fin_user)
    emp_emp = _emp("EMP", employee_user, manager=mgr_emp)

    cat = ClaimCategory.all_objects.create(
        org_id=org.id,
        code="MEAL",
        name="Meals",
        requires_attachment=False,
        currency_code="MYR",
    )
    return org, mgr_user, fin_user, employee_user, emp_emp, cat


@pytest.fixture
def approver_user(_stack):
    """The level-1 (manager) approver -- receives the claim.submitted notice
    and is the acting approver for the rejected-at-manager-level scenario.
    """
    return _stack[1]


@pytest.fixture
def employee_user(_stack):
    return _stack[3]


def _new_claim(_stack):
    org, _mgr_user, _fin_user, _employee_user, emp_emp, cat = _stack
    return ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp_emp,
        category=cat,
        amount=Decimal("100"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 6, 1),
        description="Lunch",
    )


@pytest.fixture
def submitted_claim_request(_stack):
    _org, _mgr_user, _fin_user, employee_user, _emp_emp, _cat = _stack
    claim = _new_claim(_stack)
    ClaimRequestService.submit(claim, actor=employee_user)
    return claim


@pytest.fixture
def approved_claim_request(_stack):
    """Under-500 chain is 2 steps (manager then finance); finance's approval
    is terminal, so the final approver on the trail is fin_user.
    """
    _org, mgr_user, fin_user, employee_user, _emp_emp, _cat = _stack
    claim = _new_claim(_stack)
    ClaimRequestService.submit(claim, actor=employee_user)
    ClaimRequestService.act(claim, actor=mgr_user, decision=Decision.APPROVE, comment="ok")
    ClaimRequestService.act(claim, actor=fin_user, decision=Decision.APPROVE, comment="will pay")
    return claim


@pytest.fixture
def rejected_claim_request(_stack):
    """Rejected at the manager (level-1) stage, so the acting approver is mgr_user."""
    _org, mgr_user, _fin_user, employee_user, _emp_emp, _cat = _stack
    claim = _new_claim(_stack)
    ClaimRequestService.submit(claim, actor=employee_user)
    ClaimRequestService.act(claim, actor=mgr_user, decision=Decision.REJECT, comment="not allowed")
    return claim


def _cc_context(user, type_code):
    n = Notification.objects.filter(user=user, type=type_code).first()
    assert n is not None, f"no {type_code} notification was created"
    return n.cc_context


def test_submitted_binds_the_requester(submitted_claim_request, approver_user, employee_user):
    assert _cc_context(approver_user, "claim.submitted") == {"requester": str(employee_user.id)}


def test_approved_binds_the_approver(approved_claim_request, employee_user, _stack):
    fin_user = _stack[2]
    assert _cc_context(employee_user, "claim.approved") == {"approver": str(fin_user.id)}


def test_rejected_binds_the_acting_approver(rejected_claim_request, approver_user, employee_user):
    assert _cc_context(employee_user, "claim.rejected") == {"approver": str(approver_user.id)}
