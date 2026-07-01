"""Idempotent loader for the permission catalogue.

Each milestone adds its own permission codes via additional fixtures.
This command loads ALL fixtures named permissions_*.yaml in
modules/identity/fixtures/.

Usage:
    python manage.py seed_permission_catalogue
"""

from pathlib import Path

import yaml
from django.core.management.base import BaseCommand
from django.db import transaction

from modules.identity.models import Permission


class Command(BaseCommand):
    help = "Load all permission catalogues from modules/identity/fixtures/permissions_*.yaml."

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        fixtures_dir = Path(__file__).resolve().parent.parent.parent / "fixtures"
        files = sorted(fixtures_dir.glob("permissions_*.yaml"))
        if not files:
            self.stderr.write("No permission fixtures found.")
            return

        total_new = 0
        total_seen = 0
        for f in files:
            with f.open() as fh:
                entries = yaml.safe_load(fh) or []
            for e in entries:
                _, created = Permission.objects.update_or_create(
                    code=e["code"],
                    defaults={
                        "description": e.get("description", ""),
                        "label": e.get("label", ""),
                        "is_dangerous": e.get("dangerous", False),
                        "requires": e.get("requires", []),
                    },
                )
                total_seen += 1
                if created:
                    total_new += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Permission catalogue: {total_seen} entries seen, {total_new} created/updated."
            )
        )
