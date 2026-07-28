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
