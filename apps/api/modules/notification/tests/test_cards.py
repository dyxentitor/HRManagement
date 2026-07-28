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
