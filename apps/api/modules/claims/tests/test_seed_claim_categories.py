"""seed_claim_categories: idempotent reconciliation of the canonical claim categories."""

from __future__ import annotations

import datetime
from decimal import Decimal

import pytest

from modules.claims.management.commands.seed_claim_categories import (
    DEFAULT_CLAIM_CATEGORIES,
    RETIRED_CLAIM_CATEGORY_CODES,
    seed_default_claim_categories,
)
from modules.claims.models import ClaimCategory, ClaimRequest
from modules.employee.models import Employee
from modules.organization.models import Department, Organization

pytestmark = pytest.mark.django_db

CANONICAL_CODES = {
    "TRANSPORT",
    "MEDICAL",
    "OFFICE",
    "IT_SOFTWARE",
    "TRAINING",
    "WELFARE",
    "MISC",
}


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="Fresh Co",
        slug="fresh-co",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def _alive(org: Organization):
    return ClaimCategory.all_objects.filter(org_id=org.id, deleted_at__isnull=True)


def test_seeds_the_canonical_categories_on_a_fresh_org(org: Organization) -> None:
    created, present, retired = seed_default_claim_categories(org)
    assert (created, present, retired) == (7, 0, 0)
    assert set(_alive(org).values_list("code", flat=True)) == CANONICAL_CODES

    transport = ClaimCategory.all_objects.get(org_id=org.id, code="TRANSPORT")
    assert transport.name == "Transportation"
    assert transport.requires_attachment is True
    assert transport.max_amount_per_claim == Decimal("2000")
    assert transport.currency_code == "MYR"


def test_rerun_is_idempotent_and_preserves_admin_edits(org: Organization) -> None:
    seed_default_claim_categories(org)
    # Simulate an admin renaming a category + changing its limit.
    ClaimCategory.all_objects.filter(org_id=org.id, code="MISC").update(
        name="Other Expenses", max_amount_per_claim=Decimal("500")
    )

    created, present, retired = seed_default_claim_categories(org)
    assert (created, present, retired) == (0, 7, 0)
    assert _alive(org).count() == 7

    misc = ClaimCategory.all_objects.get(org_id=org.id, code="MISC")
    # get_or_create must NOT clobber the admin's edits
    assert misc.name == "Other Expenses"
    assert misc.max_amount_per_claim == Decimal("500")


def test_retires_superseded_categories(org: Organization) -> None:
    """TRAVEL / MEALS are soft-deleted, not removed, and retirement is idempotent."""
    for code, name in [("TRAVEL", "Travel"), ("MEALS", "Meals")]:
        ClaimCategory.all_objects.create(org_id=org.id, code=code, name=name)

    created, _present, retired = seed_default_claim_categories(org)
    assert created == 7
    assert retired == 2

    for code in RETIRED_CLAIM_CATEGORY_CODES:
        row = ClaimCategory.all_objects.get(org_id=org.id, code=code)
        assert row.deleted_at is not None, f"{code} should be soft-deleted, not hard-deleted"
    # retired codes are gone from the alive set the dropdown/cards read from
    assert set(_alive(org).values_list("code", flat=True)) == CANONICAL_CODES

    # second run must not re-retire (no updated_at churn)
    _created2, _present2, retired2 = seed_default_claim_categories(org)
    assert retired2 == 0


def test_claim_on_a_retired_category_still_resolves(org: Organization) -> None:
    """Historical claims must keep rendering after their category is retired.

    Guards the retirement contract: ClaimCategory has no Meta.base_manager_name,
    so Django uses a plain Manager for forward-FK traversal and soft-deleted
    rows stay reachable via ``claim.category``. If someone later points
    base_manager_name at the tenant-scoped manager, this test fails loudly —
    the claims list/detail endpoints serialize ``category.code``/``name``
    lazily and would 500 for every historical TRAVEL/MEALS claim.
    """
    dept = Department.all_objects.create(org_id=org.id, name="Ops")
    emp = Employee.all_objects.create(
        org_id=org.id,
        employee_code="EMP-RET-1",
        first_name="Retired",
        last_name="Category",
        email="ret@test.com",
        department=dept,
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
    )
    travel = ClaimCategory.all_objects.create(org_id=org.id, code="TRAVEL", name="Travel")
    claim = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp,
        category=travel,
        amount=Decimal("120.00"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 1, 15),
        description="Historical trip",
        status="submitted",
    )

    seed_default_claim_categories(org)  # retires TRAVEL

    fresh = ClaimRequest.all_objects.get(id=claim.id)  # no select_related → lazy FK
    assert fresh.category.code == "TRAVEL"
    assert fresh.category.name == "Travel"


def test_scoped_per_org(org: Organization) -> None:
    other = Organization.objects.create(
        name="Other Co",
        slug="other-co",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    seed_default_claim_categories(org)
    assert ClaimCategory.all_objects.filter(org_id=other.id).count() == 0
    assert len(DEFAULT_CLAIM_CATEGORIES) == 7
