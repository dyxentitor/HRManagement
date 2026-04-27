"""Claim models — categories, policies, requests, attachments, approvals."""

import datetime
import os
import uuid
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet
from django.db import IntegrityError

from modules.claims.models import (
    ClaimApproval,
    ClaimAttachment,
    ClaimCategory,
    ClaimPolicy,
    ClaimRequest,
)
from modules.employee.models import Employee
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
    emp = Employee.all_objects.create(
        org_id=org.id,
        employee_code="E1",
        first_name="A",
        last_name="B",
        email="a@x.com",
        phone="+1",
        date_of_birth=datetime.date(1990, 1, 1),
        gender="other",
        nationality="MY",
        marital_status="single",
        address_line1="x",
        city="x",
        state="x",
        postcode="00000",
        country_code="MY",
        department=dept,
        role_title="x",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        bank_name="x",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )
    return org, emp


@pytest.mark.django_db
def test_claim_category_create(setup) -> None:
    org, _ = setup
    cat = ClaimCategory.all_objects.create(
        org_id=org.id,
        code="TRAVEL",
        name="Travel",
        requires_attachment=True,
        currency_code="MYR",
    )
    assert cat.code == "TRAVEL"


@pytest.mark.django_db
def test_claim_category_unique_per_org(setup) -> None:
    org, _ = setup
    ClaimCategory.all_objects.create(
        org_id=org.id,
        code="TRAVEL",
        name="Travel",
        requires_attachment=True,
        currency_code="MYR",
    )
    with pytest.raises(IntegrityError):
        ClaimCategory.all_objects.create(
            org_id=org.id,
            code="TRAVEL",
            name="Dup",
            requires_attachment=False,
            currency_code="MYR",
        )


@pytest.mark.django_db
def test_claim_policy_with_chain_code(setup) -> None:
    org, _ = setup
    cat = ClaimCategory.all_objects.create(
        org_id=org.id,
        code="TRAVEL",
        name="Travel",
        requires_attachment=True,
        currency_code="MYR",
    )
    p = ClaimPolicy.all_objects.create(
        org_id=org.id,
        category=cat,
        annual_limit=Decimal("10000"),
        monthly_limit=Decimal("2000"),
        approval_chain_code="CLAIM_UNDER_500",
    )
    assert p.approval_chain_code == "CLAIM_UNDER_500"


@pytest.mark.django_db
def test_claim_request_draft(setup) -> None:
    org, emp = setup
    cat = ClaimCategory.all_objects.create(
        org_id=org.id,
        code="MEAL",
        name="Meals",
        requires_attachment=False,
        currency_code="MYR",
    )
    r = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp,
        category=cat,
        amount=Decimal("123.45"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 6, 1),
        description="Team lunch",
    )
    assert r.status == "draft"
    assert r.current_level == 0


@pytest.mark.django_db
def test_claim_attachment(setup) -> None:
    org, emp = setup
    cat = ClaimCategory.all_objects.create(
        org_id=org.id,
        code="MEAL",
        name="Meals",
        requires_attachment=True,
        currency_code="MYR",
    )
    r = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp,
        category=cat,
        amount=Decimal("50"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 6, 1),
        description="x",
    )
    a = ClaimAttachment.objects.create(
        claim=r,
        filename="receipt.pdf",
        content_type="application/pdf",
        size_bytes=12345,
        s3_key=f"claims/{r.id}/receipt.pdf",
        uploaded_by=uuid.uuid4(),
    )
    assert a.claim_id == r.id
    assert r.attachments.count() == 1


@pytest.mark.django_db
def test_claim_approval(setup) -> None:
    org, emp = setup
    cat = ClaimCategory.all_objects.create(
        org_id=org.id,
        code="MEAL",
        name="Meals",
        requires_attachment=False,
        currency_code="MYR",
    )
    r = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp,
        category=cat,
        amount=Decimal("50"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 6, 1),
        description="x",
    )
    a = ClaimApproval.objects.create(
        claim=r,
        level=1,
        approver_id=uuid.uuid4(),
        status="pending",
    )
    assert a.status == "pending"
    assert r.approvals.count() == 1
