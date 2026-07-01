"""Seed demo incentive data so the Mandays module is testable end-to-end (idempotent).

    python manage.py seed_incentive [--org-id <uuid>]

Creates, per org: a customer with a 200-manday pool, one open project (budget 40) owned by a
manager, an accepted+active mandays bond for every active employee (so anyone can claim), two
demo claims (one left PENDING for a manager to approve, one auto-approved to populate the ledger).

Re-running is safe — it skips rows that already exist. NOTE: existing demo orgs seeded before the
incentive perms shipped need ``python manage.py grant_default_perms`` once to backfill the new
permission grants onto their roles.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from modules.employee.models import Employee
from modules.identity.models import User, UserRole
from modules.incentive.models import Claim, Customer, EmployeeBond, MandayLedger, Project
from modules.incentive.services import ledger
from modules.organization.models import Organization

CUSTOMER_NAME = "Acme Corp (demo)"
PROJECT_NAME = "Acme Pentest — Q3 (demo)"


class Command(BaseCommand):
    help = "Seed demo incentive/mandays data (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--org-id", default=None, help="Limit to one org (default: all).")

    def handle(self, *args, **opts):
        orgs = (
            Organization.objects.filter(id=opts["org_id"])
            if opts["org_id"]
            else Organization.objects.all()
        )
        for org in orgs:
            self._seed_org(org)

    def _user_id_for_role(self, org, code):
        return (
            UserRole.objects.filter(role__org_id=org.id, role__code=code)
            .values_list("user_id", flat=True)
            .first()
        )

    def _employee_for_user(self, org, user_id):
        if not user_id:
            return None
        return Employee.all_objects.filter(
            org_id=org.id, user_id=user_id, deleted_at__isnull=True
        ).first()

    def _seed_org(self, org):
        admin_id = (
            self._user_id_for_role(org, "org_admin")
            or User.objects.filter(org_id=org.id).values_list("id", flat=True).first()
        )
        if admin_id is None:
            self.stdout.write(f"  {org.slug}: no users, skipping")
            return

        manager_emp = (
            self._employee_for_user(org, self._user_id_for_role(org, "manager"))
            or Employee.all_objects.filter(org_id=org.id, deleted_at__isnull=True).first()
        )
        if manager_emp is None:
            self.stdout.write(f"  {org.slug}: no employees, skipping")
            return

        employees = list(
            Employee.all_objects.filter(org_id=org.id, deleted_at__isnull=True).order_by(
                "employee_code"
            )
        )

        # 1. Accepted + active bond for every employee (so anyone can claim).
        today = timezone.localdate()
        bonded = 0
        for emp in employees:
            _, created = EmployeeBond.objects.get_or_create(
                org_id=org.id,
                employee_id=emp.id,
                defaults={
                    "accepted_at": timezone.now(),
                    "period_start": today - dt.timedelta(days=30),
                    "period_end": today + dt.timedelta(days=365),
                    "terms_version": "v1",
                    "created_by": admin_id,
                },
            )
            bonded += int(created)

        # 2. Customer + a 200-manday pool (top up only once).
        customer, _ = Customer.objects.get_or_create(
            org_id=org.id, name=CUSTOMER_NAME, defaults={"created_by": admin_id}
        )
        if not MandayLedger.objects.filter(customer=customer, ledger_type="pool_topup").exists():
            ledger.top_up(customer, 200, actor_id=admin_id, note="Demo seed")

        # 3. One open project (budget 40), owned by a manager.
        project, _ = Project.objects.get_or_create(
            org_id=org.id,
            customer=customer,
            name=PROJECT_NAME,
            defaults={
                "budget_mandays": Decimal("40"),
                "manager_id": manager_emp.id,
                "description": "Demo project for the mandays incentive module.",
                "created_by": admin_id,
            },
        )

        # 4. Two demo claims from rank-and-file employees (skip if any claim already exists).
        if not Claim.objects.filter(project=project).exists():
            claimants = [e for e in employees if e.id != manager_emp.id][:2]
            for i, emp in enumerate(claimants):
                claim = Claim.objects.create(
                    org_id=org.id,
                    project=project,
                    employee_id=emp.id,
                    mandays=Decimal("5"),
                    note="Demo contribution",
                    created_by=admin_id,
                )
                # Approve the first to populate the ledger; leave the second PENDING to review.
                if i == 0:
                    ledger.approve_claim(claim, actor_id=admin_id)

        self.stdout.write(
            self.style.SUCCESS(
                f"  {org.slug}: customer pool 200md, project '{PROJECT_NAME}' (40md), "
                f"{bonded} new bonds, demo claims ready. Remaining pool: "
                f"{ledger.customer_remaining(customer.id)}md."
            )
        )
