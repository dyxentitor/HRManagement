"""Idempotently seed the standard claim categories for one or all orgs.

Root cause this fixes: ``seed_provintell`` (the prod cutover seeder) never
created any ClaimCategory rows, so a freshly provisioned prod org had none —
the Claim Category dropdown and the category cards on the Claims dashboard both
render from ``GET /claims/categories/`` and so came up empty.

Uses ``get_or_create`` (create-if-absent) so re-running never clobbers an
admin's edits to an existing category — the same load-bearing rule as
``seed_default_roles`` (CLAUDE.md §3.6).

Superseded codes are *retired* (soft-deleted), never hard-deleted:
``ClaimRequest.category`` is ``on_delete=PROTECT`` and historical claims still
reference TRAVEL / MEALS. Soft-deleting keeps the row, so those claims keep
resolving their category name, while ``ClaimCategoryViewSet`` (which filters
``deleted_at__isnull=True``) stops offering them in the dropdown and cards.
"""

from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand

from modules.claims.models import ClaimCategory
from modules.organization.models import Organization

# Canonical, org-agnostic default categories.
DEFAULT_CLAIM_CATEGORIES = [
    {"code": "TRANSPORT", "name": "Transportation"},
    {"code": "MEDICAL", "name": "Medical & Healthcare"},
    {"code": "OFFICE", "name": "Office & Work Supplies"},
    {"code": "IT_SOFTWARE", "name": "IT & Software"},
    {"code": "TRAINING", "name": "Training & Certification"},
    {"code": "WELFARE", "name": "Employee Welfare"},
    {"code": "MISC", "name": "Miscellaneous"},
]
# Superseded codes, retired (soft-deleted) on seed. Must stay OUT of
# DEFAULT_CLAIM_CATEGORIES — the partial unique index is conditioned on
# `deleted_at IS NULL`, so a code in both lists would resurrect its tombstone.
RETIRED_CLAIM_CATEGORY_CODES = ["TRAVEL", "MEALS"]

_SHARED_DEFAULTS = {
    "requires_attachment": True,
    "max_amount_per_claim": Decimal("2000"),
    "currency_code": "MYR",
}


def seed_default_claim_categories(org: Organization) -> tuple[int, int, int]:
    """Reconcile ``org``'s claim categories to the canonical set.

    Creates any missing default, leaves existing ones untouched (so admin
    customisations survive re-runs), and soft-deletes any superseded code that
    is still live.

    Returns ``(created, already_present, retired)``.
    """
    created = 0
    present = 0
    for spec in DEFAULT_CLAIM_CATEGORIES:
        _, was_created = ClaimCategory.all_objects.get_or_create(
            org_id=org.id,
            code=spec["code"],
            defaults={"name": spec["name"], **_SHARED_DEFAULTS},
        )
        if was_created:
            created += 1
        else:
            present += 1

    # Retire superseded codes. Filtering on deleted_at__isnull=True keeps this
    # a no-op on re-runs (no updated_at churn, retired == 0).
    retired = 0
    stale = ClaimCategory.all_objects.filter(
        org_id=org.id,
        code__in=RETIRED_CLAIM_CATEGORY_CODES,
        deleted_at__isnull=True,
    )
    for category in stale:
        category.delete()  # BaseModel.delete → soft delete (stamps deleted_at)
        retired += 1

    return created, present, retired


class Command(BaseCommand):
    help = "Idempotently reconcile claim categories to the canonical set for one or all orgs."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--org-slug",
            dest="org_slug",
            default=None,
            help="Seed only the org with this slug (default: every organization).",
        )

    def handle(self, *args, **options) -> None:
        slug = options.get("org_slug")
        orgs = Organization.objects.filter(slug=slug) if slug else Organization.objects.all()
        if not orgs:
            self.stdout.write(self.style.WARNING(f"No organization matched slug={slug!r}."))
            return
        for org in orgs:
            created, present, retired = seed_default_claim_categories(org)
            self.stdout.write(
                self.style.SUCCESS(
                    f"{org.slug}: {created} created, {present} already present, "
                    f"{retired} retired"
                )
            )
