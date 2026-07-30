"""Idempotently seed the standard claim categories for one or all orgs.

Root cause this fixes: ``seed_provintell`` (the prod cutover seeder) never
created any ClaimCategory rows, so a freshly provisioned prod org had none —
the Claim Category dropdown and the category cards on the Claims dashboard both
render from ``GET /claims/categories/`` and so came up empty.

Uses ``get_or_create`` (create-if-absent) so re-running never clobbers an
admin's edits to an existing category — the same load-bearing rule as
``seed_default_roles`` (CLAUDE.md §3.6). The canonical set mirrors the
Development source of truth (TRAVEL / MEALS / MISC).
"""

from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand

from modules.claims.models import ClaimCategory
from modules.organization.models import Organization

# Canonical, org-agnostic default categories (mirrors dev seed_demo_data).
DEFAULT_CLAIM_CATEGORIES = [
    {"code": "TRAVEL", "name": "Travel"},
    {"code": "MEALS", "name": "Meals"},
    {"code": "MISC", "name": "Miscellaneous"},
]
_SHARED_DEFAULTS = {
    "requires_attachment": True,
    "max_amount_per_claim": Decimal("2000"),
    "currency_code": "MYR",
}


def seed_default_claim_categories(org: Organization) -> tuple[int, int]:
    """Create the standard claim categories for ``org`` if absent.

    Returns ``(created, already_present)``. Idempotent: existing categories are
    left untouched so admin customisations survive re-runs.
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
    return created, present


class Command(BaseCommand):
    help = "Idempotently seed standard claim categories (TRAVEL, MEALS, MISC) for one or all orgs."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--org-slug",
            dest="org_slug",
            default=None,
            help="Seed only the org with this slug (default: every organization).",
        )

    def handle(self, *args, **options) -> None:
        slug = options.get("org_slug")
        orgs = (
            Organization.objects.filter(slug=slug) if slug else Organization.objects.all()
        )
        if not orgs:
            self.stdout.write(self.style.WARNING(f"No organization matched slug={slug!r}."))
            return
        for org in orgs:
            created, present = seed_default_claim_categories(org)
            self.stdout.write(
                self.style.SUCCESS(
                    f"{org.slug}: {created} created, {present} already present"
                )
            )
