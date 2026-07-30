"""seed_claim_categories: idempotent backfill of the standard claim categories."""

from __future__ import annotations

from decimal import Decimal

import pytest

from modules.claims.management.commands.seed_claim_categories import (
    DEFAULT_CLAIM_CATEGORIES,
    seed_default_claim_categories,
)
from modules.claims.models import ClaimCategory
from modules.organization.models import Organization

pytestmark = pytest.mark.django_db


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


def test_seeds_the_three_standard_categories_on_a_fresh_org(org: Organization) -> None:
    created, present = seed_default_claim_categories(org)
    assert (created, present) == (3, 0)
    codes = set(
        ClaimCategory.all_objects.filter(org_id=org.id).values_list("code", flat=True)
    )
    assert codes == {"TRAVEL", "MEALS", "MISC"}
    travel = ClaimCategory.all_objects.get(org_id=org.id, code="TRAVEL")
    assert travel.name == "Travel"
    assert travel.requires_attachment is True
    assert travel.max_amount_per_claim == Decimal("2000")
    assert travel.currency_code == "MYR"


def test_rerun_is_idempotent_and_preserves_admin_edits(org: Organization) -> None:
    seed_default_claim_categories(org)
    # Simulate an admin renaming a category + changing its limit.
    ClaimCategory.all_objects.filter(org_id=org.id, code="MEALS").update(
        name="Meals & Entertainment", max_amount_per_claim=Decimal("500")
    )

    created, present = seed_default_claim_categories(org)
    assert (created, present) == (0, 3)
    assert ClaimCategory.all_objects.filter(org_id=org.id).count() == 3
    meals = ClaimCategory.all_objects.get(org_id=org.id, code="MEALS")
    # get_or_create must NOT clobber the admin's edits
    assert meals.name == "Meals & Entertainment"
    assert meals.max_amount_per_claim == Decimal("500")


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
    assert len(DEFAULT_CLAIM_CATEGORIES) == 3
