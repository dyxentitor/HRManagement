"""Tests for the CardContext / build_card enricher (cards.py)."""

from __future__ import annotations

import datetime
import os
import uuid

import pytest
from cryptography.fernet import Fernet

from modules.identity.models import User
from modules.notification.models import Notification
from modules.notification.services.cards import build_card, _fmt_range, _fmt_money


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@pytest.fixture
def make_user_with_employee():
    """Factory: creates a User + linked Employee. Pass first_name=<name>."""
    from modules.employee.models import Employee
    from modules.organization.models import Department, Organization

    def _factory(first_name="Test"):
        org_id = uuid.uuid4()
        org = Organization.objects.create(
            name="TestOrg",
            slug=f"testorg-{org_id.hex[:8]}",
            country_code="MY",
            default_currency="MYR",
            default_timezone="Asia/Kuala_Lumpur",
            default_locale="en-MY",
        )
        dept = Department.all_objects.create(org_id=org.id, name="Dept")
        user = User.objects.create_user(
            email=f"user-{org_id.hex[:8]}@x.com",
            password="x",  # pragma: allowlist secret
            org_id=org.id,
        )
        Employee.all_objects.create(
            org_id=org.id,
            employee_code=f"E{org_id.hex[:6]}",
            first_name=first_name,
            last_name="Test",
            email=f"emp-{org_id.hex[:8]}@x.com",
            phone="+60123456789",
            date_of_birth=datetime.date(1990, 1, 1),
            gender="other",
            nationality="MY",
            marital_status="single",
            address_line1="1 Jalan Test",
            city="KL",
            state="Kuala Lumpur",
            postcode="50000",
            country_code="MY",
            department=dept,
            role_title="Staff",
            employment_type="fulltime",
            hire_date=datetime.date(2024, 1, 1),
            emergency_contact_name="EC",
            emergency_contact_relationship="spouse",
            emergency_contact_phone="+60198765432",
            user=user,
        )
        return user

    return _factory


@pytest.fixture
def make_user_no_employee():
    """Factory: creates a User with NO linked Employee."""

    def _factory():
        org_id = uuid.uuid4()
        return User.objects.create_user(
            email=f"noname-{org_id.hex[:8]}@x.com",
            password="x",  # pragma: allowlist secret
            org_id=org_id,
        )

    return _factory


@pytest.mark.django_db
def test_generic_card_for_unknown_type(make_user_with_employee):
    user = make_user_with_employee(first_name="Jane")
    n = Notification(org_id=user.org_id, user=user, type="announcement.published",
                     payload={"title": "Town hall"}, deep_link="/announcements")
    card = build_card(n)
    assert card.greeting_name == "Jane"
    assert "announcement" in card.headline.lower() or "New announcement" in card.headline
    assert card.cta_label == "View in HRMS"
    assert card.cta_url.endswith("/announcements")


@pytest.mark.django_db
def test_greeting_falls_back_to_there(make_user_no_employee):
    user = make_user_no_employee()
    n = Notification(org_id=user.org_id, user=user, type="x.y", payload={}, deep_link="")
    assert build_card(n).greeting_name == "there"


def test_fmt_helpers():
    assert _fmt_range(datetime.date(2026, 8, 12), datetime.date(2026, 8, 14)) == "12–14 Aug 2026"
    assert _fmt_range(datetime.date(2026, 8, 12), datetime.date(2026, 8, 12)) == "12 Aug 2026"
    assert _fmt_money("1250", "MYR") == "MYR 1,250.00"


# ---------------------------------------------------------------------------
# Leave domain card tests
# ---------------------------------------------------------------------------

@pytest.fixture
def leave_setup():
    """Return (org, leave_type, emp_employee, emp_user) with a real Employee row."""
    from decimal import Decimal

    from modules.employee.models import Employee
    from modules.leave.models import LeaveBalance, LeaveType
    from modules.organization.models import Department, Organization

    org_id = uuid.uuid4()
    org = Organization.objects.create(
        name="LeaveOrg",
        slug=f"leaveorg-{org_id.hex[:8]}",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="HR")
    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL",
        name="Annual Leave",
        accrual_type="annual",
        default_days=Decimal("14"),
        is_paid=True,
        is_statutory=True,
        gender_restriction="any",
    )
    user = User.objects.create_user(
        email=f"emp-{org_id.hex[:8]}@leave.test",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    emp = Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=f"L{org_id.hex[:6]}",
        first_name="Alice",
        last_name="Wong",
        email=f"emp-{org_id.hex[:8]}@leave.test",
        phone="+60123456789",
        date_of_birth=datetime.date(1990, 5, 1),
        gender="female",
        nationality="MY",
        marital_status="single",
        address_line1="1 Jalan Damai",
        city="KL",
        state="Kuala Lumpur",
        postcode="50000",
        country_code="MY",
        department=dept,
        role_title="Engineer",
        employment_type="fulltime",
        hire_date=datetime.date(2023, 1, 1),
        emergency_contact_name="Bob",
        emergency_contact_relationship="spouse",
        emergency_contact_phone="+60198765432",
    )
    return org, lt, emp, user


@pytest.fixture
def make_leave_request_approved(leave_setup):
    """Factory: returns (Notification, LeaveRequest) for an approved leave."""
    from decimal import Decimal

    from modules.leave.models import LeaveApproval, LeaveBalance, LeaveRequest

    def _factory():
        org, lt, emp, user = leave_setup
        lr = LeaveRequest.all_objects.create(
            org_id=org.id,
            employee_id=emp.id,
            leave_type=lt,
            start_date=datetime.date(2026, 8, 10),
            end_date=datetime.date(2026, 8, 12),
            total_days=Decimal("3"),
            is_half_day=False,
            reason="Holiday",
            status="approved",
        )
        LeaveApproval.objects.create(
            leave_request=lr,
            level=1,
            approver_id=uuid.uuid4(),
            status="approved",
        )
        LeaveBalance.all_objects.create(
            org_id=org.id,
            employee_id=emp.id,
            leave_type=lt,
            year=2026,
            entitled=Decimal("14"),
            accrued=Decimal("14"),
            taken=Decimal("3"),
            pending=Decimal("0"),
        )
        n = Notification(
            org_id=org.id,
            user=user,
            type="leave.approved",
            channel="email",
            payload={"leave_request_id": str(lr.id)},
            deep_link="/leave/me",
        )
        return n, lr

    return _factory


@pytest.mark.django_db
def test_leave_approved_card(make_leave_request_approved):
    n, lr = make_leave_request_approved()
    card = build_card(n)
    assert "approved" in card.headline.lower()
    d = dict(card.rows)
    assert d["Type"] == lr.leave_type.name
    assert d["Days"] == "3"
    assert "Dates" in d
    assert card.cta_url.endswith("/leave/me")
    # Balance row should be present
    assert "Balance left" in d


@pytest.mark.django_db
def test_leave_rejected_card_includes_comment(leave_setup):
    """Rejected card must include the LeaveApproval.comment as the 'Reason' row."""
    from decimal import Decimal

    from modules.leave.models import LeaveApproval, LeaveRequest

    org, lt, emp, user = leave_setup
    lr = LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=emp.id,
        leave_type=lt,
        start_date=datetime.date(2026, 9, 1),
        end_date=datetime.date(2026, 9, 2),
        total_days=Decimal("2"),
        is_half_day=False,
        reason="Personal",
        status="rejected",
    )
    LeaveApproval.objects.create(
        leave_request=lr,
        level=1,
        approver_id=uuid.uuid4(),
        status="rejected",
        comment="Insufficient cover during the period.",
    )
    n = Notification(
        org_id=org.id,
        user=user,
        type="leave.rejected",
        channel="email",
        payload={"leave_request_id": str(lr.id)},
        deep_link="/leave/me",
    )
    card = build_card(n)
    # Headline indicates rejection (not a positive approval message)
    assert "approved" not in card.headline.lower() or "wasn't" in card.headline.lower() or "not" in card.headline.lower()
    assert "reject" in card.headline.lower() or "wasn't" in card.headline.lower() or "not approved" in card.headline.lower()
    d = dict(card.rows)
    assert d.get("Reason") == "Insufficient cover during the period."
    assert card.cta_url.endswith("/leave/me")


@pytest.mark.django_db
def test_leave_submitted_card_targets_approver(leave_setup):
    """Submitted card headline mentions the employee name and CTA goes to /leave/approvals."""
    from decimal import Decimal

    from modules.leave.models import LeaveRequest
    from modules.identity.models import User

    org, lt, emp, emp_user = leave_setup
    # The notification recipient is the APPROVER (a different user)
    approver_user = User.objects.create_user(
        email=f"approver-{org.id.hex[:8]}@leave.test",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    lr = LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=emp.id,
        leave_type=lt,
        start_date=datetime.date(2026, 10, 5),
        end_date=datetime.date(2026, 10, 5),
        total_days=Decimal("1"),
        is_half_day=False,
        reason="Event",
        status="submitted",
    )
    n = Notification(
        org_id=org.id,
        user=approver_user,
        type="leave.submitted",
        channel="email",
        payload={"leave_request_id": str(lr.id)},
        deep_link="/leave/approvals",
    )
    card = build_card(n)
    assert "Alice" in card.headline
    assert "approval" in card.headline.lower()
    assert card.cta_url.endswith("/leave/approvals")
    d = dict(card.rows)
    assert d.get("Employee") == "Alice Wong"


@pytest.mark.django_db
def test_leave_replacement_card_uses_payload():
    """replacement_granted uses payload fields; no leave_request_id needed."""
    org_id = uuid.uuid4()
    user = User.objects.create_user(
        email=f"repl-{org_id.hex[:8]}@leave.test",
        password="x",  # pragma: allowlist secret
        org_id=org_id,
    )
    n = Notification(
        org_id=org_id,
        user=user,
        type="leave.replacement_granted",
        channel="email",
        payload={"leave_type": "REPLACEMENT", "year": 2026, "days": "1"},
        deep_link="/leave/me",
    )
    card = build_card(n)
    assert "replacement" in card.headline.lower() or "granted" in card.headline.lower()
    d = dict(card.rows)
    assert d.get("Days") == "1"
    assert d.get("Year") == "2026"
    assert card.cta_url.endswith("/leave/me")


@pytest.mark.django_db
def test_leave_card_falls_back_to_generic_on_missing_request(leave_setup):
    """If leave_request_id is invalid/missing, fall back to generic card without crashing."""
    org, lt, emp, user = leave_setup
    n = Notification(
        org_id=org.id,
        user=user,
        type="leave.approved",
        channel="email",
        payload={"leave_request_id": str(uuid.uuid4())},  # non-existent
        deep_link="/leave/me",
    )
    card = build_card(n)
    # Should not raise; headline comes from label_for
    assert card is not None
    assert isinstance(card.headline, str)


# ---------------------------------------------------------------------------
# Claims domain card tests
# ---------------------------------------------------------------------------

@pytest.fixture
def claim_setup():
    """Return (org, category, emp_employee, emp_user) with a real Employee + ClaimRequest."""
    from modules.claims.models import ClaimCategory, ClaimRequest
    from modules.employee.models import Employee
    from modules.organization.models import Department, Organization

    org_id = uuid.uuid4()
    org = Organization.objects.create(
        name="ClaimOrg",
        slug=f"claimorg-{org_id.hex[:8]}",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    user = User.objects.create_user(
        email=f"emp-{org_id.hex[:8]}@claim.test",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    emp = Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=f"C{org_id.hex[:6]}",
        first_name="Bob",
        last_name="Tan",
        email=f"emp-{org_id.hex[:8]}@claim.test",
        phone="+60123456789",
        date_of_birth=datetime.date(1988, 3, 15),
        gender="male",
        nationality="MY",
        marital_status="single",
        address_line1="2 Jalan Claim",
        city="KL",
        state="Kuala Lumpur",
        postcode="50000",
        country_code="MY",
        department=dept,
        role_title="Engineer",
        employment_type="fulltime",
        hire_date=datetime.date(2022, 6, 1),
        emergency_contact_name="Ann",
        emergency_contact_relationship="parent",
        emergency_contact_phone="+60198765432",
    )
    cat = ClaimCategory.all_objects.create(
        org_id=org.id,
        code="MEAL",
        name="Meals",
        requires_attachment=False,
        currency_code="MYR",
    )
    return org, cat, emp, user


@pytest.mark.django_db
def test_claim_approved_card(claim_setup):
    """Approved claim card shows Category, Amount, Expense date, Merchant."""
    from decimal import Decimal
    from modules.claims.models import ClaimRequest

    org, cat, emp, user = claim_setup
    cr = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp,
        category=cat,
        amount=Decimal("125.50"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 7, 15),
        merchant="Nasi Kandar ABC",
        status="finance_approved",
    )
    n = Notification(
        org_id=org.id,
        user=user,
        type="claim.approved",
        channel="email",
        payload={"claim_request_id": str(cr.id)},
        deep_link="/claims/me",
    )
    card = build_card(n)
    assert "approved" in card.headline.lower()
    d = dict(card.rows)
    assert d.get("Category") == "Meals"
    assert "125.50" in d.get("Amount", "")
    assert "Expense date" in d or "Expense Date" in d
    expense_val = d.get("Expense date") or d.get("Expense Date")
    assert expense_val is not None
    assert card.cta_url.endswith("/claims/me")


@pytest.mark.django_db
def test_claim_rejected_card_includes_reason(claim_setup):
    """Rejected claim card shows Reason from ClaimApproval.comment."""
    from decimal import Decimal
    from modules.claims.models import ClaimApproval, ClaimRequest

    org, cat, emp, user = claim_setup
    cr = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp,
        category=cat,
        amount=Decimal("80.00"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 7, 20),
        merchant="Coffee Bean",
        status="rejected",
    )
    ClaimApproval.objects.create(
        claim=cr,
        level=1,
        approver_id=uuid.uuid4(),
        status="rejected",
        comment="Receipt does not match claimed amount.",
    )
    n = Notification(
        org_id=org.id,
        user=user,
        type="claim.rejected",
        channel="email",
        payload={"claim_request_id": str(cr.id)},
        deep_link="/claims/me",
    )
    card = build_card(n)
    assert "approved" not in card.headline.lower() or "wasn't" in card.headline.lower()
    d = dict(card.rows)
    assert d.get("Reason") == "Receipt does not match claimed amount."
    assert card.whats_next


@pytest.mark.django_db
def test_claim_submitted_card_targets_approver(claim_setup):
    """Submitted card headline names the employee and CTA goes to /claims/approvals."""
    from decimal import Decimal
    from modules.claims.models import ClaimRequest
    from modules.identity.models import User as HRMSUser

    org, cat, emp, emp_user = claim_setup
    approver_user = HRMSUser.objects.create_user(
        email=f"approver-{org.id.hex[:8]}@claim.test",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    cr = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp,
        category=cat,
        amount=Decimal("200.00"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 7, 10),
        merchant="Hotel KL",
        status="submitted",
    )
    # Real call site (_notify_for_claim in claims/signals.py) always sends
    # deep_link="/claims/me" — even for the approver — so use that here.
    # The builder must hardcode /claims/approvals for this type, ignoring deep_link.
    n = Notification(
        org_id=org.id,
        user=approver_user,
        type="claim.submitted",
        channel="email",
        payload={"claim_request_id": str(cr.id)},
        deep_link="/claims/me",
    )
    card = build_card(n)
    assert "Bob" in card.headline
    assert "approval" in card.headline.lower()
    assert card.cta_url.endswith("/claims/approvals")
    d = dict(card.rows)
    assert d.get("Employee") == "Bob Tan"


@pytest.mark.django_db
def test_claim_reimbursed_card(claim_setup):
    """Reimbursed claim card shows Category, Amount, Merchant, Status."""
    from decimal import Decimal
    from modules.claims.models import ClaimRequest

    org, cat, emp, user = claim_setup
    cr = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp,
        category=cat,
        amount=Decimal("350.00"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 6, 30),
        merchant="Grand Hotel",
        status="reimbursed",
    )
    n = Notification(
        org_id=org.id,
        user=user,
        type="claim.reimbursed",
        channel="email",
        payload={"claim_request_id": str(cr.id)},
        deep_link="/claims/me",
    )
    card = build_card(n)
    assert "reimbursed" in card.headline.lower()
    d = dict(card.rows)
    assert d.get("Category") == "Meals"
    assert "350.00" in d.get("Amount", "")
    assert d.get("Merchant") == "Grand Hotel"
    assert "Status" in d


@pytest.mark.django_db
def test_claim_card_falls_back_to_generic_on_missing_request(claim_setup):
    """Missing claim_request_id falls back to generic card without crashing."""
    org, cat, emp, user = claim_setup
    n = Notification(
        org_id=org.id,
        user=user,
        type="claim.approved",
        channel="email",
        payload={"claim_request_id": str(uuid.uuid4())},  # non-existent
        deep_link="/claims/me",
    )
    card = build_card(n)
    assert card is not None
    assert isinstance(card.headline, str)


# ---------------------------------------------------------------------------
# Incentive domain card tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_incentive_approved_card_from_payload(make_user_with_employee):
    """incentive.claim_approved card shows Project and Mandays from payload."""
    user = make_user_with_employee(first_name="Siti")
    n = Notification(
        org_id=user.org_id,
        user=user,
        type="incentive.claim_approved",
        channel="email",
        payload={
            "claim_id": str(uuid.uuid4()),
            "project": "Alpha Project",
            "mandays": "5",
            "reason": "",
        },
        deep_link="/incentive",
    )
    card = build_card(n)
    assert "approved" in card.headline.lower()
    d = dict(card.rows)
    assert d.get("Project") == "Alpha Project"
    assert d.get("Mandays") == "5"
    assert card.cta_url.endswith("/incentive")


@pytest.mark.django_db
def test_incentive_rejected_card_includes_reason(make_user_with_employee):
    """incentive.claim_rejected card shows Project, Mandays, and Reason."""
    user = make_user_with_employee(first_name="Raj")
    n = Notification(
        org_id=user.org_id,
        user=user,
        type="incentive.claim_rejected",
        channel="email",
        payload={
            "claim_id": str(uuid.uuid4()),
            "project": "Beta Project",
            "mandays": "3",
            "reason": "Budget exceeded.",
        },
        deep_link="/incentive",
    )
    card = build_card(n)
    assert "rejected" in card.headline.lower()
    d = dict(card.rows)
    assert d.get("Project") == "Beta Project"
    assert d.get("Mandays") == "3"
    assert d.get("Reason") == "Budget exceeded."


@pytest.mark.django_db
def test_incentive_submitted_card(make_user_with_employee):
    """incentive.claim_submitted card shows Project and Mandays."""
    user = make_user_with_employee(first_name="Lee")
    n = Notification(
        org_id=user.org_id,
        user=user,
        type="incentive.claim_submitted",
        channel="email",
        payload={
            "claim_id": str(uuid.uuid4()),
            "project": "Gamma Project",
            "mandays": "7",
        },
        deep_link="/incentive",
    )
    card = build_card(n)
    assert "submitted" in card.headline.lower() or "mandays" in card.headline.lower()
    d = dict(card.rows)
    assert d.get("Project") == "Gamma Project"
    assert d.get("Mandays") == "7"
    assert card.cta_url.endswith("/incentive")


# ---------------------------------------------------------------------------
# Payslip domain card tests
# ---------------------------------------------------------------------------


@pytest.fixture
def payslip_setup():
    """Return (org, payslip_record, user) with a real PayslipRecord + PayrollPeriod."""
    from decimal import Decimal

    from modules.employee.models import Employee
    from modules.organization.models import Department, Organization
    from modules.payslip.models import PayrollPeriod, PayslipRecord

    org_id = uuid.uuid4()
    org = Organization.objects.create(
        name="PayslipOrg",
        slug=f"paysliporg-{org_id.hex[:8]}",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Finance")
    user = User.objects.create_user(
        email=f"emp-{org_id.hex[:8]}@payslip.test",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    emp = Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=f"P{org_id.hex[:6]}",
        first_name="Charlie",
        last_name="Lim",
        email=f"emp-{org_id.hex[:8]}@payslip.test",
        phone="+60123456789",
        date_of_birth=datetime.date(1985, 6, 15),
        gender="male",
        nationality="MY",
        marital_status="married",
        address_line1="3 Jalan Payslip",
        city="KL",
        state="Kuala Lumpur",
        postcode="50000",
        country_code="MY",
        department=dept,
        role_title="Accountant",
        employment_type="fulltime",
        hire_date=datetime.date(2021, 3, 1),
        emergency_contact_name="Diana",
        emergency_contact_relationship="spouse",
        emergency_contact_phone="+60198765432",
    )
    period = PayrollPeriod.all_objects.create(
        org_id=org.id,
        period_start=datetime.date(2026, 7, 1),
        period_end=datetime.date(2026, 7, 31),
        period_type="monthly",
        pay_date=datetime.date(2026, 7, 28),
        status="completed",
    )
    payslip = PayslipRecord.all_objects.create(
        org_id=org.id,
        employee_id=emp.id,
        period=period,
        gross=Decimal("5000.00"),
        net=Decimal("4200.50"),
        currency_code="MYR",
        source="manual",
        status="published",
    )
    return org, payslip, user


@pytest.mark.django_db
def test_payslip_published_card_shows_period_and_net(payslip_setup):
    """payslip.published card shows Pay period, Pay date, and Net pay."""
    org, payslip, user = payslip_setup
    n = Notification(
        org_id=org.id,
        user=user,
        type="payslip.published",
        channel="email",
        payload={"payslip_id": str(payslip.id), "period_start": "2026-07-01"},
        deep_link="/payslips/me",
    )
    card = build_card(n)
    assert "July" in card.headline
    assert "ready" in card.headline.lower()
    d = dict(card.rows)
    assert "Pay period" in d
    assert "Pay date" in d
    assert "Net pay" in d
    assert "4,200.50" in d["Net pay"]
    assert "MYR" in d["Net pay"]
    assert card.cta_label == "View payslip"
    assert card.cta_url.endswith("/payslips/me")
    assert "Download" in card.whats_next


@pytest.mark.django_db
def test_payslip_card_falls_back_to_generic_on_missing_payslip(payslip_setup):
    """Missing payslip_id returns a generic card without crashing."""
    org, payslip, user = payslip_setup
    n = Notification(
        org_id=org.id,
        user=user,
        type="payslip.published",
        channel="email",
        payload={"payslip_id": str(uuid.uuid4())},  # non-existent
        deep_link="/payslips/me",
    )
    card = build_card(n)
    assert card is not None
    assert isinstance(card.headline, str)


# ---------------------------------------------------------------------------
# Certification domain card tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_cert_expiring_soon_card_from_payload(make_user_with_employee):
    """cert.expiring_soon card shows Certificate, Expires on, Days left from payload."""
    user = make_user_with_employee(first_name="Diana")
    n = Notification(
        org_id=user.org_id,
        user=user,
        type="cert.expiring_soon",
        channel="email",
        payload={
            "cert_id": str(uuid.uuid4()),
            "cert_name": "AWS Solutions Architect",
            "expires_on": "2026-08-15",
            "days_remaining": 18,
        },
        deep_link="/certifications/me",
    )
    card = build_card(n)
    assert "AWS Solutions Architect" in card.headline
    assert "expires" in card.headline.lower()
    d = dict(card.rows)
    assert d.get("Certificate") == "AWS Solutions Architect"
    assert "Expires on" in d
    assert "15" in d["Expires on"] and "Aug" in d["Expires on"]
    assert d.get("Days left") == "18"
    assert card.cta_label == "View certifications"
    assert card.cta_url.endswith("/certifications/me")
    assert "Renew" in card.whats_next


# ---------------------------------------------------------------------------
# Roster domain card tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_roster_published_card_from_payload(make_user_with_employee):
    """schedule.roster_published card shows Period from parsed date payload."""
    user = make_user_with_employee(first_name="Eric")
    n = Notification(
        org_id=user.org_id,
        user=user,
        type="schedule.roster_published",
        channel="email",
        payload={
            "date_from": "2026-08-01",
            "date_to": "2026-08-31",
        },
        deep_link="/schedule/me",
    )
    card = build_card(n)
    assert "roster" in card.headline.lower() or "published" in card.headline.lower()
    d = dict(card.rows)
    assert "Period" in d
    assert "Aug" in d["Period"]
    assert card.cta_label == "View my schedule"
    assert card.cta_url.endswith("/schedule/me")


# ---------------------------------------------------------------------------
# Assignment domain card tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_assignment_reminder_card_shows_task_and_due(make_user_with_employee):
    """assignment.reminder card shows Task, Due date rows and whats_next.

    Real call site (modules/assignments/tasks.py) sends
    payload={"title": ..., "due": str(r.due_date)}, deep_link="/action-center".
    """
    user = make_user_with_employee(first_name="Farid")
    n = Notification(
        org_id=user.org_id,
        user=user,
        type="assignment.reminder",
        channel="email",
        payload={"title": "Complete onboarding checklist", "due": "2026-08-20"},
        deep_link="/action-center",
    )
    card = build_card(n)
    assert "Reminder" in card.headline
    assert "Complete onboarding checklist" in card.headline
    d = dict(card.rows)
    assert d.get("Task") == "Complete onboarding checklist"
    assert "Due date" in d
    assert card.whats_next == "Due soon."
    assert card.cta_url.endswith("/action-center")


@pytest.mark.django_db
def test_assignment_assigned_card(make_user_with_employee):
    """assignment.assigned card shows Task and Due date rows.

    Real call site (modules/assignments/services/engine.py) sends
    payload={"title": ..., "due": str(assignment.default_due_date or "")},
    deep_link="/action-center" — no "type" key.
    """
    user = make_user_with_employee(first_name="Gina")
    n = Notification(
        org_id=user.org_id,
        user=user,
        type="assignment.assigned",
        channel="email",
        payload={"title": "Sign NDA", "due": "2026-09-01"},
        deep_link="/action-center",
    )
    card = build_card(n)
    assert "New task" in card.headline
    assert "Sign NDA" in card.headline
    d = dict(card.rows)
    assert d.get("Task") == "Sign NDA"
    assert "Due date" in d
    # No "type" key in real payload — assert it is absent from rows
    assert "Type" not in d
    assert card.cta_url.endswith("/action-center")


@pytest.mark.django_db
def test_assignment_overdue_card(make_user_with_employee):
    """assignment.overdue card shows Task, Due date and whats_next about overdue.

    Real call site (modules/assignments/tasks.py) sends
    payload={"title": ..., "due": str(r.due_date)}, deep_link="/action-center".
    """
    user = make_user_with_employee(first_name="Hani")
    n = Notification(
        org_id=user.org_id,
        user=user,
        type="assignment.overdue",
        channel="email",
        payload={"title": "Submit timesheet", "due": "2026-07-31"},
        deep_link="/action-center",
    )
    card = build_card(n)
    assert "Overdue" in card.headline
    assert "Submit timesheet" in card.headline
    d = dict(card.rows)
    assert d.get("Task") == "Submit timesheet"
    assert "Due date" in d
    assert "overdue" in card.whats_next.lower()
    assert card.cta_url.endswith("/action-center")


# ---------------------------------------------------------------------------
# KPI domain card tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_kpi_cycle_opens_self_review_card(make_user_with_employee):
    """kpi.cycle_opens_self_review card headline mentions cycle + CTA goes to /kpi/me."""
    user = make_user_with_employee(first_name="Ivan")
    n = Notification(
        org_id=user.org_id,
        user=user,
        type="kpi.cycle_opens_self_review",
        channel="email",
        payload={"cycle": "Q3 2026"},
        deep_link="/kpi/me",
    )
    card = build_card(n)
    assert "Q3 2026" in card.headline
    assert "self-review" in card.headline.lower()
    d = dict(card.rows)
    assert d.get("Cycle") == "Q3 2026"
    assert card.cta_label == "Start self-review"
    assert card.cta_url.endswith("/kpi/me")


@pytest.mark.django_db
def test_kpi_cycle_opens_manager_review_card(make_user_with_employee):
    """kpi.cycle_opens_manager_review card mentions cycle + CTA goes to /kpi/admin."""
    user = make_user_with_employee(first_name="Julia")
    n = Notification(
        org_id=user.org_id,
        user=user,
        type="kpi.cycle_opens_manager_review",
        channel="email",
        payload={"cycle": "Q3 2026"},
        deep_link="/kpi/admin",
    )
    card = build_card(n)
    assert "Q3 2026" in card.headline
    assert "manager" in card.headline.lower() or "review" in card.headline.lower()
    d = dict(card.rows)
    assert d.get("Cycle") == "Q3 2026"
    assert card.cta_label == "Open reviews"
    assert card.cta_url.endswith("/kpi/admin")


@pytest.mark.django_db
def test_kpi_review_submitted_self_card(make_user_with_employee):
    """kpi.review_submitted_self card hydrates Cycle row from a real KpiAssignment.

    The real call site (modules/kpi/services/review.py::_notify_manager_for_review)
    sends payload={"assignment_id": str(assignment.id)} with NO "cycle" key.
    The builder must hydrate the cycle name from the KpiAssignment FK.
    """
    from modules.kpi.models import KpiAssignment, KpiCycle, KpiTemplate

    user = make_user_with_employee(first_name="Kev")
    cycle = KpiCycle.all_objects.create(
        org_id=user.org_id,
        name="Q3 2026",
        type="quarterly",
        starts_on=datetime.date(2026, 7, 1),
        ends_on=datetime.date(2026, 9, 30),
        review_opens_on=datetime.date(2026, 9, 15),
        review_closes_on=datetime.date(2026, 9, 30),
        status="self_review",
    )
    template = KpiTemplate.all_objects.create(org_id=user.org_id, name="Default")
    assignment = KpiAssignment.all_objects.create(
        org_id=user.org_id,
        cycle=cycle,
        employee_id=uuid.uuid4(),
        template=template,
        kpis=[],
        status="self_done",
    )
    # Real call site sends only assignment_id — no "cycle" key
    n = Notification(
        org_id=user.org_id,
        user=user,
        type="kpi.review_submitted_self",
        channel="email",
        payload={"assignment_id": str(assignment.id)},
        deep_link="/kpi/admin",
    )
    card = build_card(n)
    assert "submitted" in card.headline.lower() or "review" in card.headline.lower()
    d = dict(card.rows)
    # Cycle name must be hydrated from the KpiAssignment FK, not from the payload
    assert d.get("Cycle") == "Q3 2026"


# ---------------------------------------------------------------------------
# Employee tenure domain card tests
# ---------------------------------------------------------------------------


@pytest.fixture
def tenure_setup():
    """Return (org, emp, user) with a real Employee row + probation/contract dates."""
    from modules.employee.models import Employee
    from modules.organization.models import Department, Organization

    org_id = uuid.uuid4()
    org = Organization.objects.create(
        name="TenureOrg",
        slug=f"tenureorg-{org_id.hex[:8]}",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Ops")
    user = User.objects.create_user(
        email=f"tenure-{org_id.hex[:8]}@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    emp = Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=f"T{org_id.hex[:6]}",
        first_name="Lena",
        last_name="Cruz",
        email=f"tenure-{org_id.hex[:8]}@x.com",
        phone="+60123456789",
        date_of_birth=datetime.date(1995, 3, 20),
        gender="female",
        nationality="MY",
        marital_status="single",
        address_line1="5 Jalan Tenure",
        city="KL",
        state="Kuala Lumpur",
        postcode="50000",
        country_code="MY",
        department=dept,
        role_title="Analyst",
        employment_type="contract",
        hire_date=datetime.date(2025, 8, 1),
        emergency_contact_name="Marco",
        emergency_contact_relationship="parent",
        emergency_contact_phone="+60198765432",
        probation_end_date=datetime.date(2026, 8, 27),
        contract_end_date=datetime.date(2026, 12, 31),
    )
    return org, emp, user


@pytest.mark.django_db
def test_employee_probation_ending_soon_card_hydrated(tenure_setup):
    """employee.probation_ending_soon card shows Employee row, End date from hydrated model."""
    org, emp, user = tenure_setup
    n = Notification(
        org_id=org.id,
        user=user,
        type="employee.probation_ending_soon",
        channel="email",
        payload={
            "employee_id": str(emp.id),
            "employee_code": emp.employee_code,
            "name": "Lena Cruz",
        },
        deep_link=f"/employees/{emp.id}",
    )
    card = build_card(n)
    assert "Lena Cruz" in card.headline
    assert "probation" in card.headline.lower()
    d = dict(card.rows)
    assert "Employee" in d
    assert "Lena Cruz" in d["Employee"]
    assert emp.employee_code in d["Employee"]
    assert "End date" in d
    assert "Aug" in d["End date"] and "2026" in d["End date"]
    assert "Days left" in d
    assert "Review" in card.whats_next
    assert card.cta_label == "View employee"
    assert str(emp.id) in card.cta_url


@pytest.mark.django_db
def test_employee_contract_ending_soon_card_hydrated(tenure_setup):
    """employee.contract_ending_soon card shows Employee row and End date from hydrated model."""
    org, emp, user = tenure_setup
    n = Notification(
        org_id=org.id,
        user=user,
        type="employee.contract_ending_soon",
        channel="email",
        payload={
            "employee_id": str(emp.id),
            "employee_code": emp.employee_code,
            "name": "Lena Cruz",
        },
        deep_link=f"/employees/{emp.id}",
    )
    card = build_card(n)
    assert "Lena Cruz" in card.headline
    assert "contract" in card.headline.lower()
    d = dict(card.rows)
    assert "Employee" in d
    assert "End date" in d
    assert "Dec" in d["End date"] and "2026" in d["End date"]
    assert card.cta_label == "View employee"


@pytest.mark.django_db
def test_employee_probation_ending_soon_card_no_hydration(make_user_with_employee):
    """employee.probation_ending_soon still produces a card even without a matching Employee row."""
    user = make_user_with_employee(first_name="Marc")
    n = Notification(
        org_id=user.org_id,
        user=user,
        type="employee.probation_ending_soon",
        channel="email",
        payload={
            "employee_id": str(uuid.uuid4()),  # non-existent
            "employee_code": "E99999",
            "name": "Ghost User",
        },
        deep_link="/employees/ghost",
    )
    card = build_card(n)
    assert "Ghost User" in card.headline
    assert "probation" in card.headline.lower()
    d = dict(card.rows)
    assert "Employee" in d
    # End date should be absent (no hydration)
    assert "End date" not in d
