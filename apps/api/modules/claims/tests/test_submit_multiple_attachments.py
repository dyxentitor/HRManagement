"""Regression: claim submission is independent of attachment count.

Production incident 2026-08-06 — a top-of-chain manager's claim submission
returned HTTP 400, and the failure was attributed to attaching two PDFs. It was
not: ``submit()`` performs no attachment validation at all. The real cause was
``NoApproverFound`` (the claimant had no manager, so level 1 resolved to None),
which the exception handler maps to 400. Attempts with ONE attachment failed
identically.

These tests pin both halves of that finding:
* submission succeeds with 0, 1 and 2 attachments (count is irrelevant);
* a claimant with no manager above them can submit, via the v1.79.0
  self-approval fallback.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from modules.claims.models import ClaimAttachment, ClaimCategory, ClaimRequest
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization

pytestmark = pytest.mark.django_db

PERMS = (
    "claim:create:self",
    "claim:read:self",
    "claim:approve:team",
)


@pytest.fixture
def top_of_chain_claimant():
    """Mirrors Yat Ming Pang: holds `manager`, has nobody above them."""
    org = Organization.objects.create(
        name="C",
        slug="c-multiattach",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Ops")
    user = User.objects.create_user(
        email="topmgr@c.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="manager", name="Manager", is_system=True)
    for code in PERMS:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role)

    emp = Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code="TOP-1",
        first_name="Top",
        last_name="Mgr",
        email="topmgr@c.com",
        department=dept,
        manager=None,  # nobody above — the production condition
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )
    category = ClaimCategory.all_objects.create(
        org_id=org.id,
        code="IT_SOFTWARE",
        name="IT & Software",
        requires_attachment=True,
        max_amount_per_claim=Decimal("2000"),
        currency_code="MYR",
    )
    client = APIClient()
    client.force_authenticate(user)
    return org, emp, category, client


def _make_claim(org, emp, category) -> ClaimRequest:
    return ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp,
        category=category,
        amount=Decimal("406.63"),  # the production amount -> claim_under_500 chain
        currency_code="MYR",
        expense_date=dt.date(2026, 8, 1),
        description="Test",
        status="draft",
        current_level=0,
    )


def _attach(claim: ClaimRequest, n: int, uploader) -> None:
    for i in range(n):
        ClaimAttachment.objects.create(
            claim=claim,
            filename=f"Receipt-{i}.pdf",
            content_type="application/pdf",
            size_bytes=32630,
            s3_key=f"claims/{claim.id}/file-{i}.pdf",
            uploaded_by=uploader.id,
        )


@pytest.mark.parametrize("attachment_count", [0, 1, 2, 5])
def test_submit_succeeds_regardless_of_attachment_count(
    top_of_chain_claimant, attachment_count
) -> None:
    """The production report blamed 2 PDFs; submit() never inspects attachments."""
    org, emp, category, client = top_of_chain_claimant
    claim = _make_claim(org, emp, category)
    _attach(claim, attachment_count, emp.user)

    resp = client.post(f"/api/v1/claims/{claim.id}/submit/", {}, format="json")

    assert resp.status_code == 200, resp.content
    claim.refresh_from_db()
    assert claim.status == "submitted"
    assert claim.current_level == 1
    assert claim.attachments.count() == attachment_count


def test_two_pdfs_reproduce_the_reported_scenario(top_of_chain_claimant) -> None:
    """The exact reported case: top-of-chain manager + two valid PDFs."""
    org, emp, category, client = top_of_chain_claimant
    claim = _make_claim(org, emp, category)
    _attach(claim, 2, emp.user)

    resp = client.post(f"/api/v1/claims/{claim.id}/submit/", {}, format="json")

    assert resp.status_code == 200, resp.content
    claim.refresh_from_db()
    assert claim.status == "submitted"
    # both attachments survive submission intact
    assert sorted(claim.attachments.values_list("filename", flat=True)) == [
        "Receipt-0.pdf",
        "Receipt-1.pdf",
    ]
