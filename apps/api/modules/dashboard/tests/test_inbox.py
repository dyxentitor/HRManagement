"""Tests for the unified approvals inbox service + endpoint."""

from __future__ import annotations

import datetime
import os
import uuid
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.claims.models import (
    ClaimApproval,
    ClaimAttachment,
    ClaimCategory,
    ClaimRequest,
)
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.kpi.models import KpiAssignment, KpiCycle, KpiTemplate
from modules.leave.models import LeaveApproval, LeaveRequest, LeaveType
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY",
            Fernet.generate_key().decode(),  # pragma: allowlist secret
        )


def _make_employee(code: str, user: User, org, dept, manager=None) -> Employee:
    return Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=code,
        first_name=code,
        last_name="Test",
        email=f"{code.lower()}@test.com",
        phone="+600",
        date_of_birth=datetime.date(1990, 1, 1),
        gender="other",
        nationality="MY",
        marital_status="single",
        address_line1="123 St",
        city="KL",
        state="WP",
        postcode="50000",
        country_code="MY",
        department=dept,
        manager=manager,
        role_title="Staff",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        bank_name="Bank",
        emergency_contact_name="EC",
        emergency_contact_relationship="parent",
        emergency_contact_phone="+601",
    )


def _grant(user: User, *codes: str) -> None:
    org_id = user.org_id
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        role_code = f"role_{code.replace(':', '_')}_{uuid.uuid4().hex[:6]}"
        role = Role.objects.create(org_id=org_id, code=role_code, name=role_code, is_system=False)
        RolePermission.objects.create(role=role, permission=p)
        UserRole.objects.create(user=user, role=role, granted_by=None)


@pytest.fixture
def stack():
    org = Organization.objects.create(
        name="TestOrg",
        slug=f"testorg-{uuid.uuid4().hex[:6]}",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Engineering")

    mgr_user = User.objects.create_user(
        email=f"mgr_{uuid.uuid4().hex[:6]}@test.com",
        password="pass",  # pragma: allowlist secret
        org_id=org.id,
    )
    emp_user = User.objects.create_user(
        email=f"emp_{uuid.uuid4().hex[:6]}@test.com",
        password="pass",  # pragma: allowlist secret
        org_id=org.id,
    )
    mgr_emp = _make_employee("MGR001", mgr_user, org, dept)
    emp_emp = _make_employee("EMP001", emp_user, org, dept, manager=mgr_emp)

    leave_type = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual Leave",
        accrual_type="annual",
        default_days=Decimal("14"),
        is_paid=True,
        is_statutory=True,
        gender_restriction="any",
    )
    claim_cat = ClaimCategory.all_objects.create(
        org_id=org.id,
        code="MEAL",
        name="Meals",
        requires_attachment=False,
        currency_code="MYR",
    )
    return org, mgr_user, emp_user, mgr_emp, emp_emp, leave_type, claim_cat


@pytest.mark.django_db
def test_manager_sees_pending_leave_of_direct_report(stack):
    """Manager with a pending LeaveApproval row sees the leave request in inbox."""
    from modules.dashboard.services.inbox import get_inbox

    org, mgr_user, emp_user, mgr_emp, emp_emp, leave_type, _ = stack

    lr = LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=emp_emp.id,
        leave_type=leave_type,
        start_date=datetime.date(2026, 5, 1),
        end_date=datetime.date(2026, 5, 3),
        total_days=Decimal("3"),
        status="submitted",
        submitted_at=datetime.datetime(2026, 4, 27, 10, 0, tzinfo=datetime.UTC),
    )
    LeaveApproval.objects.create(
        leave_request=lr, level=1, approver_id=mgr_user.id, status="pending"
    )

    items = get_inbox(user=mgr_user)
    assert len(items) == 1
    assert items[0].kind == "leave"
    assert items[0].id == str(lr.id)
    assert items[0].employee_code == "EMP001"


@pytest.mark.django_db
def test_approver_sees_pending_claim(stack):
    """Finance approver with a pending ClaimApproval row sees the claim in inbox."""
    from modules.dashboard.services.inbox import get_inbox

    org, mgr_user, emp_user, mgr_emp, emp_emp, _, claim_cat = stack

    cr = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp_emp,
        category=claim_cat,
        amount=Decimal("250.00"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 4, 20),
        description="Team lunch",
        status="submitted",
        submitted_at=datetime.datetime(2026, 4, 25, 9, 0, tzinfo=datetime.UTC),
    )
    ClaimApproval.objects.create(claim=cr, level=1, approver_id=mgr_user.id, status="pending")

    items = get_inbox(user=mgr_user)
    assert len(items) == 1
    assert items[0].kind == "claim"
    assert items[0].id == str(cr.id)


@pytest.mark.django_db
def test_claim_inbox_item_includes_attachments(stack):
    """A pending claim's inbox item exposes its receipts in detail.attachments."""
    from modules.dashboard.services.inbox import get_inbox

    org, mgr_user, emp_user, _mgr_emp, emp_emp, _, claim_cat = stack

    cr = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp_emp,
        category=claim_cat,
        amount=Decimal("90.00"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 4, 20),
        description="Taxi",
        status="submitted",
        submitted_at=datetime.datetime(2026, 4, 25, 9, 0, tzinfo=datetime.UTC),
    )
    ClaimApproval.objects.create(claim=cr, level=1, approver_id=mgr_user.id, status="pending")
    att = ClaimAttachment.objects.create(
        claim=cr,
        filename="receipt.pdf",
        content_type="application/pdf",
        size_bytes=2048,
        s3_key="claims/x/receipt.pdf",
        uploaded_by=emp_user.id,
    )

    items = get_inbox(user=mgr_user)
    attachments = items[0].detail["attachments"]
    assert len(attachments) == 1
    assert attachments[0]["id"] == att.id
    assert attachments[0]["filename"] == "receipt.pdf"
    assert attachments[0]["size_bytes"] == 2048


@pytest.mark.django_db
def test_mixed_leave_and_claim_sorted_newest_first(stack):
    """Mixed leave + claim items are sorted by submitted_at descending."""
    from modules.dashboard.services.inbox import get_inbox

    org, mgr_user, emp_user, mgr_emp, emp_emp, leave_type, claim_cat = stack

    lr = LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=emp_emp.id,
        leave_type=leave_type,
        start_date=datetime.date(2026, 5, 1),
        end_date=datetime.date(2026, 5, 2),
        total_days=Decimal("2"),
        status="submitted",
        submitted_at=datetime.datetime(2026, 4, 26, 8, 0, tzinfo=datetime.UTC),  # older
    )
    LeaveApproval.objects.create(
        leave_request=lr, level=1, approver_id=mgr_user.id, status="pending"
    )

    cr = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp_emp,
        category=claim_cat,
        amount=Decimal("100.00"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 4, 25),
        description="Taxi",
        status="submitted",
        submitted_at=datetime.datetime(2026, 4, 27, 10, 0, tzinfo=datetime.UTC),  # newer
    )
    ClaimApproval.objects.create(claim=cr, level=1, approver_id=mgr_user.id, status="pending")

    items = get_inbox(user=mgr_user)
    assert len(items) == 2
    assert items[0].kind == "claim"  # newer first
    assert items[1].kind == "leave"


@pytest.mark.django_db
def test_user_with_no_pending_gets_empty_inbox(stack):
    """A user with no pending approvals gets an empty list."""
    from modules.dashboard.services.inbox import get_inbox

    _, _, emp_user, _, _, _, _ = stack
    items = get_inbox(user=emp_user)
    assert items == []


@pytest.mark.django_db
def test_inbox_endpoint_requires_permission(stack):
    """GET /api/v1/approvals/inbox requires approvals:inbox:read."""
    _, _, emp_user, _, _, _, _ = stack
    client = APIClient()
    resp = client.post(
        "/api/v1/auth/login",
        {"email": emp_user.email, "password": "pass"},  # pragma: allowlist secret
        format="json",
    )
    token = resp.json().get("access_token", "")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = client.get("/api/v1/approvals/inbox")
    assert response.status_code == 403


@pytest.mark.django_db
def test_manager_sees_kpi_self_review_in_inbox(stack):
    """Manager sees KPI assignments awaiting their review in the inbox."""
    from modules.dashboard.services.inbox import get_inbox

    org, mgr_user, emp_user, mgr_emp, emp_emp, _, _ = stack

    # Create a KPI template, cycle in manager_review, and assignment with self_done status
    template = KpiTemplate.all_objects.create(
        org_id=org.id,
        name="Standard KPI",
    )
    cycle = KpiCycle.all_objects.create(
        org_id=org.id,
        name="Q2 2026",
        type="quarterly",
        starts_on=datetime.date(2026, 4, 1),
        ends_on=datetime.date(2026, 6, 30),
        review_opens_on=datetime.date(2026, 7, 1),
        review_closes_on=datetime.date(2026, 7, 15),
        status="manager_review",
    )
    assignment = KpiAssignment.all_objects.create(
        org_id=org.id,
        cycle=cycle,
        employee_id=emp_emp.id,
        template=template,
        status="self_done",
    )

    items = get_inbox(user=mgr_user)
    kpi_items = [i for i in items if i.kind == "kpi"]
    assert len(kpi_items) == 1
    assert kpi_items[0].id == str(assignment.id)
    assert kpi_items[0].employee_code == "EMP001"
    assert "Q2 2026" in kpi_items[0].summary


@pytest.mark.django_db
def test_kpi_not_in_inbox_when_cycle_not_in_manager_review(stack):
    """KPI assignments not in manager_review cycle are excluded from inbox."""
    from modules.dashboard.services.inbox import get_inbox

    org, mgr_user, emp_user, mgr_emp, emp_emp, _, _ = stack

    template = KpiTemplate.all_objects.create(org_id=org.id, name="Standard KPI")
    cycle = KpiCycle.all_objects.create(
        org_id=org.id,
        name="Q1 2026",
        type="quarterly",
        starts_on=datetime.date(2026, 1, 1),
        ends_on=datetime.date(2026, 3, 31),
        review_opens_on=datetime.date(2026, 4, 1),
        review_closes_on=datetime.date(2026, 4, 15),
        status="self_review",  # not manager_review
    )
    KpiAssignment.all_objects.create(
        org_id=org.id,
        cycle=cycle,
        employee_id=emp_emp.id,
        template=template,
        status="self_done",
    )

    items = get_inbox(user=mgr_user)
    kpi_items = [i for i in items if i.kind == "kpi"]
    assert len(kpi_items) == 0


@pytest.mark.django_db
def test_inbox_endpoint_returns_items_for_authorized_user(stack):
    """GET /api/v1/approvals/inbox returns items when user has the permission."""
    org, mgr_user, emp_user, mgr_emp, emp_emp, leave_type, _ = stack

    _grant(mgr_user, "approvals:inbox:read")

    lr = LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=emp_emp.id,
        leave_type=leave_type,
        start_date=datetime.date(2026, 5, 1),
        end_date=datetime.date(2026, 5, 2),
        total_days=Decimal("2"),
        status="submitted",
        submitted_at=datetime.datetime(2026, 4, 27, 10, 0, tzinfo=datetime.UTC),
    )
    LeaveApproval.objects.create(
        leave_request=lr, level=1, approver_id=mgr_user.id, status="pending"
    )

    client = APIClient()
    resp = client.post(
        "/api/v1/auth/login",
        {"email": mgr_user.email, "password": "pass"},  # pragma: allowlist secret
        format="json",
    )
    token = resp.json()["access_token"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = client.get("/api/v1/approvals/inbox")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["kind"] == "leave"
