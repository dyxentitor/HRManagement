"""ClaimRequestSerializer exposes the enriched review payload (v1.58.0)."""

import datetime
import os
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet

from modules.claims.models import ClaimApproval, ClaimCategory, ClaimRequest
from modules.claims.serializers import ClaimRequestSerializer
from modules.employee.models import Employee
from modules.identity.models import User
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv("HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode())  # pragma: allowlist secret


def _emp(org, dept, code, user, manager=None):
    return Employee.all_objects.create(
        org_id=org.id, user=user, employee_code=code, first_name=code, last_name="x",
        email=f"{code}@x.com", phone="+1", date_of_birth=datetime.date(1985, 1, 1),
        gender="other", nationality="MY", marital_status="single", address_line1="x",
        city="x", state="x", postcode="00000", country_code="MY", department=dept,
        manager=manager, role_title="Engineer", employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1), emergency_contact_name="x",
        emergency_contact_relationship="x", emergency_contact_phone="+1",
    )


@pytest.mark.django_db
def test_review_serializer_exposes_enriched_fields():
    org = Organization.objects.create(
        name="X", slug="rev", country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Engineering")
    mgr_user = User.objects.create_user(email="mgr@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    mgr_emp = _emp(org, dept, "MGR", mgr_user)
    emp_user = User.objects.create_user(email="emp@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    emp = _emp(org, dept, "EMP", emp_user, manager=mgr_emp)
    cat = ClaimCategory.all_objects.create(
        org_id=org.id, code="TRAVEL", name="Travel", requires_attachment=False, currency_code="MYR"
    )
    claim = ClaimRequest.all_objects.create(
        org_id=org.id, employee=emp, category=cat, amount=Decimal("1250.00"),
        currency_code="MYR", expense_date=datetime.date(2026, 6, 1),
        description="Client trip", business_justification="Closed the Q3 renewal",
    )
    ClaimApproval.objects.create(
        claim=claim, level=1, approver_id=mgr_user.id, status="approved",
        comment="ok", acted_at=datetime.datetime(2026, 6, 3, tzinfo=datetime.UTC),
    )

    data = ClaimRequestSerializer(claim).data
    assert data["business_justification"] == "Closed the Q3 renewal"
    assert data["employee_name"] == "EMP x"
    assert data["employee_department_name"] == "Engineering"
    assert data["employee_manager_name"] == "MGR x"
    assert data["employee_role_title"] == "Engineer"
    assert data["category_name"] == "Travel"
    assert data["approvals"][0]["approver_name"] == "MGR x"
    assert data["approvals"][0]["comment"] == "ok"


@pytest.mark.django_db
def test_business_justification_defaults_blank():
    org = Organization.objects.create(
        name="X", slug="rev2", country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    u = User.objects.create_user(email="e@x.com", password="x", org_id=org.id)  # pragma: allowlist secret
    emp = _emp(org, dept, "E", u)
    cat = ClaimCategory.all_objects.create(
        org_id=org.id, code="M", name="Meals", requires_attachment=False, currency_code="MYR"
    )
    claim = ClaimRequest.all_objects.create(
        org_id=org.id, employee=emp, category=cat, amount=Decimal("10"),
        currency_code="MYR", expense_date=datetime.date(2026, 6, 1),
    )
    data = ClaimRequestSerializer(claim).data
    assert data["business_justification"] == ""
    assert data["employee_manager_name"] is None
