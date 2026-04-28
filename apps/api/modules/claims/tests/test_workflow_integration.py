"""End-to-end claim workflow: submit, multi-step approve, finance reimburse."""

import datetime
import os
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet

from common.workflow import Decision, NotAuthorizedToAct
from modules.claims.models import ClaimApproval, ClaimCategory, ClaimRequest
from modules.claims.services.claim_request import ClaimRequestService
from modules.employee.models import Employee
from modules.identity.models import Role, User, UserRole
from modules.notification.models import Notification
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY",
            Fernet.generate_key().decode(),  # pragma: allowlist secret
        )


@pytest.fixture
def stack():
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
    emp_user = User.objects.create_user(
        email="emp@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )

    fin_role = Role.objects.create(org_id=org.id, code="finance", name="Finance", is_system=True)
    UserRole.objects.create(user=fin_user, role=fin_role, granted_by=None)

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
    emp_emp = _emp("EMP", emp_user, manager=mgr_emp)

    cat = ClaimCategory.all_objects.create(
        org_id=org.id,
        code="MEAL",
        name="Meals",
        requires_attachment=False,
        currency_code="MYR",
    )
    return org, mgr_user, fin_user, emp_user, emp_emp, cat


@pytest.mark.django_db
def test_under_500_two_step_flow(stack) -> None:
    """< 500 uses 2-step chain: Direct → Finance.
    After both approve, status = finance_approved."""
    org, mgr_user, fin_user, emp_user, emp_emp, cat = stack
    claim = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp_emp,
        category=cat,
        amount=Decimal("123.45"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 6, 1),
        description="Lunch",
    )

    ClaimRequestService.submit(claim, actor=emp_user)
    claim.refresh_from_db()
    assert claim.status == "submitted"
    assert claim.current_level == 1
    assert ClaimApproval.objects.filter(claim=claim, level=1, status="pending").count() == 1

    ClaimRequestService.act(claim, actor=mgr_user, decision=Decision.APPROVE, comment="ok")
    claim.refresh_from_db()
    assert claim.status == "submitted"  # mid-chain
    assert claim.current_level == 2

    ClaimRequestService.act(claim, actor=fin_user, decision=Decision.APPROVE, comment="will pay")
    claim.refresh_from_db()
    assert claim.status == "finance_approved"
    # M9: Notification row should exist for the requester (claim.approved)
    assert Notification.objects.filter(user=emp_user, type="claim.approved").count() > 0


@pytest.mark.django_db
def test_500_to_5000_three_step_flow(stack) -> None:
    """500..5000 uses 3-step chain. mgr_user acts as both manager AND dept head."""
    org, mgr_user, fin_user, emp_user, emp_emp, cat = stack
    # Make mgr_emp both manager and dept head of emp_emp's department
    emp_emp.department.head_employee_id = emp_emp.manager_id
    emp_emp.department.save()

    claim = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp_emp,
        category=cat,
        amount=Decimal("1000"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 6, 1),
        description="Travel",
    )

    ClaimRequestService.submit(claim, actor=emp_user)
    ClaimRequestService.act(claim, actor=mgr_user, decision=Decision.APPROVE, comment="ok")
    # Step 2: dept head — same user (mgr_user)
    ClaimRequestService.act(claim, actor=mgr_user, decision=Decision.APPROVE, comment="ok dept")
    ClaimRequestService.act(claim, actor=fin_user, decision=Decision.APPROVE, comment="paid")
    claim.refresh_from_db()
    assert claim.status == "finance_approved"


@pytest.mark.django_db
def test_reject_at_manager_level(stack) -> None:
    org, mgr_user, _, emp_user, emp_emp, cat = stack
    claim = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp_emp,
        category=cat,
        amount=Decimal("100"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 6, 1),
        description="x",
    )
    ClaimRequestService.submit(claim, actor=emp_user)
    ClaimRequestService.act(claim, actor=mgr_user, decision=Decision.REJECT, comment="not allowed")
    claim.refresh_from_db()
    assert claim.status == "rejected"
    # M9: Notification row should exist for the requester (claim.rejected)
    assert Notification.objects.filter(user=emp_user, type="claim.rejected").count() > 0


@pytest.mark.django_db
def test_unauthorized_actor_rejected(stack) -> None:
    org, _, _, emp_user, emp_emp, cat = stack
    claim = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp_emp,
        category=cat,
        amount=Decimal("100"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 6, 1),
        description="x",
    )
    ClaimRequestService.submit(claim, actor=emp_user)
    with pytest.raises(NotAuthorizedToAct):
        ClaimRequestService.act(claim, actor=emp_user, decision=Decision.APPROVE)


@pytest.mark.django_db
def test_mark_reimbursed(stack) -> None:
    org, mgr_user, fin_user, emp_user, emp_emp, cat = stack
    claim = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp_emp,
        category=cat,
        amount=Decimal("50"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 6, 1),
        description="x",
    )
    ClaimRequestService.submit(claim, actor=emp_user)
    ClaimRequestService.act(claim, actor=mgr_user, decision=Decision.APPROVE)
    ClaimRequestService.act(claim, actor=fin_user, decision=Decision.APPROVE)
    ClaimRequestService.mark_reimbursed(claim, reference="MAYBNK-1234", actor_id=fin_user.id)
    claim.refresh_from_db()
    assert claim.status == "reimbursed"
    assert claim.reimbursement_reference == "MAYBNK-1234"


@pytest.mark.django_db
def test_mark_reimbursed_invalid_state(stack) -> None:
    """Cannot mark reimbursed if status != finance_approved."""
    org, _, fin_user, _, emp_emp, cat = stack
    claim = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp_emp,
        category=cat,
        amount=Decimal("50"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 6, 1),
        description="x",
        status="submitted",
    )
    from common.workflow.exceptions import InvalidTransition

    with pytest.raises(InvalidTransition):
        ClaimRequestService.mark_reimbursed(claim, reference="X", actor_id=fin_user.id)
