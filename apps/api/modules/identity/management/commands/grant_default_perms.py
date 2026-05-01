"""Additive backfill of default permissions on existing system roles.

`seed_default_roles` is intentionally non-destructive — it only seeds permissions
when a Role is *brand-new*. That preserves admin customizations across deploys,
but it also means newly-introduced permission codes never reach pre-existing
role rows in the DB. After every release that adds perms to
`default_roles.yaml`, run this command so existing roles pick up the new entries
without touching any admin-customized perms.

Idempotent. Add-only — never removes a permission.

Usage:
    python manage.py grant_default_perms              # all orgs
    python manage.py grant_default_perms --org-id <uuid>
"""

import uuid
from pathlib import Path

import yaml
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from modules.identity.models import Permission, Role, RolePermission
from modules.organization.models import Organization


class Command(BaseCommand):
    help = "Backfill missing default permissions on existing system roles."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--org-id",
            required=False,
            help="UUID of a single org. Omit to process all orgs.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        org_id_arg = options.get("org_id")
        if org_id_arg:
            try:
                org_ids = [uuid.UUID(org_id_arg)]
            except ValueError as exc:
                raise CommandError(f"--org-id must be a valid UUID: {exc}") from exc
        else:
            org_ids = list(Organization.objects.values_list("id", flat=True))

        fixture = Path(__file__).resolve().parent.parent.parent / "fixtures" / "default_roles.yaml"
        with fixture.open() as fh:
            entries = yaml.safe_load(fh) or []

        all_perms_in_fixture = {p for e in entries for p in e.get("permissions", [])}
        db_perms = dict(
            Permission.objects.filter(code__in=all_perms_in_fixture).values_list("code", "id")
        )
        missing_in_catalogue = all_perms_in_fixture - db_perms.keys()
        if missing_in_catalogue:
            raise CommandError(
                "Permission catalogue is missing required codes; run "
                "`seed_permission_catalogue` first. Missing: "
                + ", ".join(sorted(missing_in_catalogue))
            )

        total_added = 0
        for org_id in org_ids:
            for entry in entries:
                role = Role.objects.filter(org_id=org_id, code=entry["code"]).first()
                if role is None:
                    continue
                wanted = {db_perms[c] for c in entry.get("permissions", [])}
                existing = set(
                    RolePermission.objects.filter(role=role).values_list("permission_id", flat=True)
                )
                missing = wanted - existing
                if missing:
                    RolePermission.objects.bulk_create(
                        [RolePermission(role=role, permission_id=pid) for pid in missing],
                        ignore_conflicts=True,
                    )
                    total_added += len(missing)
                    self.stdout.write(f"  {role.code} (org {org_id}): added {len(missing)} perms")

        self.stdout.write(
            self.style.SUCCESS(
                f"grant_default_perms: {total_added} permission link(s) added "
                f"across {len(org_ids)} org(s)."
            )
        )
