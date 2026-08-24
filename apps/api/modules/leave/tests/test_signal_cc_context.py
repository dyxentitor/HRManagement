"""Leave signals must bind the CC context tokens their registry entries declare."""

import datetime
import os
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet

from common.workflow import Decision
from modules.employee.models import Employee
from modules.identity.models import User
from modules.leave.models import LeaveRequest, LeaveType
from modules.leave.services.balance import BalanceService
from modules.leave.services.leave_request import LeaveRequestService
from modules.notification.models import Notification
from modules.organization.models import Department, Organization

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY",
            Fernet.generate_key().decode(),  # pragma: allowlist secret
        )


@pytest.fixture
def _stack():
    """Org + a single-level leave chain: approver_user is the direct manager
    of employee_user. Mirrors modules/leave/tests/test_workflow_integration.py.
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
    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual",
        accrual_type="annual",
        default_days=Decimal("14"),
        is_paid=True,
        is_statutory=True,
        gender_restriction="any",
    )

    approver_user = User.objects.create_user(
        email="mgr@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    employee_user = User.objects.create_user(
        email="emp@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )

    def _employee(code, user, manager=None):
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

    mgr_emp = _employee("MGR", approver_user)
    emp_emp = _employee("EMP", employee_user, manager=mgr_emp)

    BalanceService.accrue(
        org_id=org.id,
        employee_id=emp_emp.id,
        leave_type=lt,
        year=2026,
        days=Decimal("14"),
        reason="accrual",
    )
    return org, lt, approver_user, employee_user, emp_emp


@pytest.fixture
def approver_user(_stack):
    return _stack[2]


@pytest.fixture
def employee_user(_stack):
    return _stack[3]


def _new_request(_stack):
    org, lt, _approver_user, _employee_user, emp_emp = _stack
    return LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=emp_emp.id,
        leave_type=lt,
        start_date=datetime.date(2026, 6, 1),
        end_date=datetime.date(2026, 6, 3),
        total_days=Decimal("3"),
        is_half_day=False,
        reason="trip",
    )


@pytest.fixture
def submitted_leave_request(_stack):
    _org, _lt, _approver_user, employee_user, _emp_emp = _stack
    req = _new_request(_stack)
    LeaveRequestService.submit(req, actor=employee_user)
    return req


@pytest.fixture
def approved_leave_request(_stack):
    _org, _lt, approver_user, employee_user, _emp_emp = _stack
    req = _new_request(_stack)
    LeaveRequestService.submit(req, actor=employee_user)
    LeaveRequestService.act(req, actor=approver_user, decision=Decision.APPROVE, comment="ok")
    return req


@pytest.fixture
def rejected_leave_request(_stack):
    _org, _lt, approver_user, employee_user, _emp_emp = _stack
    req = _new_request(_stack)
    LeaveRequestService.submit(req, actor=employee_user)
    LeaveRequestService.act(req, actor=approver_user, decision=Decision.REJECT, comment="busy week")
    return req


def _cc_context(user, type_code):
    n = Notification.objects.filter(user=user, type=type_code).first()
    assert n is not None, f"no {type_code} notification was created"
    return n.cc_context


def test_submitted_binds_the_requester(submitted_leave_request, approver_user, employee_user):
    assert _cc_context(approver_user, "leave.submitted") == {"requester": str(employee_user.id)}


def test_approved_binds_the_approver(approved_leave_request, approver_user, employee_user):
    assert _cc_context(employee_user, "leave.approved") == {"approver": str(approver_user.id)}


def test_rejected_binds_the_acting_approver(rejected_leave_request, approver_user, employee_user):
    assert _cc_context(employee_user, "leave.rejected") == {"approver": str(approver_user.id)}
