"""End-to-end leave workflow: submit, approve, reject, cancel."""

import datetime
import os
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet

from common.workflow import Decision, NotAuthorizedToAct
from modules.employee.models import Employee
from modules.identity.models import User
from modules.leave.models import LeaveApproval, LeaveBalance, LeaveRequest, LeaveType
from modules.leave.services.balance import BalanceService
from modules.leave.services.leave_request import LeaveRequestService
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY",
            Fernet.generate_key().decode(),  # pragma: allowlist secret
        )


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

    mgr_user = User.objects.create_user(
        email="mgr@x.com",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )
    emp_user = User.objects.create_user(
        email="emp@x.com",
        password="x",
        org_id=org.id,  # pragma: allowlist secret
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

    mgr_emp = _employee("MGR", mgr_user)
    emp_emp = _employee("EMP", emp_user, manager=mgr_emp)

    # Pre-fund the balance
    BalanceService.accrue(
        org_id=org.id,
        employee_id=emp_emp.id,
        leave_type=lt,
        year=2026,
        days=Decimal("14"),
        reason="accrual",
    )
    return org, lt, mgr_user, emp_user, emp_emp


@pytest.mark.django_db
def test_submit_holds_balance_and_creates_pending_approval(setup) -> None:
    org, lt, _, emp_user, emp_emp = setup
    req = LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=emp_emp.id,
        leave_type=lt,
        start_date=datetime.date(2026, 6, 1),
        end_date=datetime.date(2026, 6, 3),
        total_days=Decimal("3"),
        is_half_day=False,
        reason="trip",
    )
    LeaveRequestService.submit(req, actor=emp_user)
    req.refresh_from_db()
    assert req.status == "submitted"
    assert req.current_level == 1
    bal = LeaveBalance.all_objects.get(employee_id=emp_emp.id, leave_type=lt, year=2026)
    assert bal.pending == Decimal("3")
    assert bal.available == Decimal("11")
    assert LeaveApproval.objects.filter(leave_request=req, level=1, status="pending").count() == 1


@pytest.mark.django_db
def test_approve_terminal_deducts_balance(setup) -> None:
    org, lt, mgr_user, emp_user, emp_emp = setup
    req = LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=emp_emp.id,
        leave_type=lt,
        start_date=datetime.date(2026, 6, 1),
        end_date=datetime.date(2026, 6, 3),
        total_days=Decimal("3"),
        is_half_day=False,
        reason="trip",
    )
    LeaveRequestService.submit(req, actor=emp_user)
    LeaveRequestService.act(req, actor=mgr_user, decision=Decision.APPROVE, comment="ok")
    req.refresh_from_db()
    assert req.status == "approved"
    bal = LeaveBalance.all_objects.get(employee_id=emp_emp.id, leave_type=lt, year=2026)
    assert bal.taken == Decimal("3")
    assert bal.pending == Decimal("0")


@pytest.mark.django_db
def test_reject_releases_balance(setup) -> None:
    org, lt, mgr_user, emp_user, emp_emp = setup
    req = LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=emp_emp.id,
        leave_type=lt,
        start_date=datetime.date(2026, 6, 1),
        end_date=datetime.date(2026, 6, 3),
        total_days=Decimal("3"),
        is_half_day=False,
        reason="trip",
    )
    LeaveRequestService.submit(req, actor=emp_user)
    LeaveRequestService.act(req, actor=mgr_user, decision=Decision.REJECT, comment="busy week")
    req.refresh_from_db()
    assert req.status == "rejected"
    bal = LeaveBalance.all_objects.get(employee_id=emp_emp.id, leave_type=lt, year=2026)
    assert bal.taken == Decimal("0")
    assert bal.pending == Decimal("0")
    assert bal.available == Decimal("14")


@pytest.mark.django_db
def test_unauthorized_actor_rejected(setup) -> None:
    org, lt, _, emp_user, emp_emp = setup
    req = LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=emp_emp.id,
        leave_type=lt,
        start_date=datetime.date(2026, 6, 1),
        end_date=datetime.date(2026, 6, 3),
        total_days=Decimal("3"),
        is_half_day=False,
        reason="trip",
    )
    LeaveRequestService.submit(req, actor=emp_user)
    # emp_user (the requester) is NOT the manager
    with pytest.raises(NotAuthorizedToAct):
        LeaveRequestService.act(req, actor=emp_user, decision=Decision.APPROVE)


@pytest.mark.django_db
def test_cancel_releases_pending(setup) -> None:
    org, lt, _, emp_user, emp_emp = setup
    req = LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=emp_emp.id,
        leave_type=lt,
        start_date=datetime.date(2026, 6, 1),
        end_date=datetime.date(2026, 6, 3),
        total_days=Decimal("3"),
        is_half_day=False,
        reason="trip",
    )
    LeaveRequestService.submit(req, actor=emp_user)
    LeaveRequestService.cancel(req, actor=emp_user)
    req.refresh_from_db()
    assert req.status == "cancelled"
    bal = LeaveBalance.all_objects.get(employee_id=emp_emp.id, leave_type=lt, year=2026)
    assert bal.pending == Decimal("0")
    assert bal.available == Decimal("14")
