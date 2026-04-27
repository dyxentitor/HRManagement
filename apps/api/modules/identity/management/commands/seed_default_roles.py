"""Idempotent loader for default system roles per org.

Reads modules/identity/fixtures/default_roles.yaml and creates one Role per
entry (scoped to the given org_id), linking the listed permission codes.

Requires the permission catalogue to be seeded first; raises CommandError
otherwise.

Usage:
    python manage.py seed_default_roles --org-id <uuid>
"""

import uuid
from pathlib import Path

import yaml
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from modules.identity.models import Permission, Role, RolePermission


class Command(BaseCommand):
    help = "Seed system role bundles (org_admin, hr_manager, ...) for an org."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--org-id",
            required=True,
            help="UUID of the organization whose roles should be seeded.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        try:
            org_id = uuid.UUID(options["org_id"])
        except ValueError as exc:
            raise CommandError(f"--org-id must be a valid UUID: {exc}") from exc

        fixture = Path(__file__).resolve().parent.parent.parent / "fixtures" / "default_roles.yaml"
        with fixture.open() as fh:
            entries = yaml.safe_load(fh) or []

        all_perms_in_fixture = {p for e in entries for p in e.get("permissions", [])}
        db_perms = dict(
            Permission.objects.filter(code__in=all_perms_in_fixture).values_list("code", "id")
        )
        missing = all_perms_in_fixture - db_perms.keys()
        if missing:
            raise CommandError(
                "Permission catalogue is missing required codes; run "
                "`seed_permission_catalogue` first. Missing: " + ", ".join(sorted(missing))
            )

        n_roles = 0
        n_links_total = 0
        for entry in entries:
            role, _ = Role.objects.update_or_create(
                org_id=org_id,
                code=entry["code"],
                defaults={
                    "name": entry["name"],
                    "description": entry.get("description", ""),
                    "is_system": entry.get("is_system", True),
                },
            )
            n_roles += 1

            # Sync permission links to match the fixture exactly (drop, then add).
            existing_perm_ids = set(role.role_permissions.values_list("permission_id", flat=True))
            wanted_perm_ids = {db_perms[c] for c in entry.get("permissions", [])}

            to_add = wanted_perm_ids - existing_perm_ids
            to_remove = existing_perm_ids - wanted_perm_ids

            if to_add:
                RolePermission.objects.bulk_create(
                    [RolePermission(role=role, permission_id=pid) for pid in to_add],
                    ignore_conflicts=True,
                )
            if to_remove:
                RolePermission.objects.filter(role=role, permission_id__in=to_remove).delete()

            n_links_total += len(wanted_perm_ids)

        msg = f"Default roles for org {org_id}: {n_roles} roles, {n_links_total} permission links."
        self.stdout.write(self.style.SUCCESS(msg))
