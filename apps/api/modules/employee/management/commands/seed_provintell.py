"""Seed real Provintell data: 1 org, 3 depts, 5 employees, 2 shifts, 2026 holidays.

Idempotent — re-running updates existing rows rather than duplicating.
Use ``--prod`` to skip demo accounts (per spec §9).
"""

from __future__ import annotations

import datetime
from decimal import Decimal

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction

from modules.employee.models import Employee, Team
from modules.identity.models import Role, User, UserRole
from modules.leave.models import LeaveType
from modules.leave.services.balance import BalanceService
from modules.organization.models import Department, Organization
from modules.schedule.models import Shift

PROVINTELL_SLUG = "provintell"


def _ensure_org() -> Organization:
    org, _ = Organization.objects.update_or_create(
        slug=PROVINTELL_SLUG,
        defaults={
            "name": "Provintell",
            "country_code": "MY",
            "default_currency": "MYR",
            "default_timezone": "Asia/Kuala_Lumpur",
            "default_locale": "en-MY",
            "status": "active",
        },
    )
    return org


def _ensure_departments(org: Organization) -> dict[str, Department]:
    out: dict[str, Department] = {}
    for code, name in [
        ("ops", "Operations"),
        ("eng", "Engineering"),
        ("hr", "Admin/HR"),
    ]:
        d, _ = Department.all_objects.update_or_create(
            org_id=org.id,
            name=name,
            defaults={},
        )
        out[code] = d
    return out


def _ensure_teams(org: Organization) -> dict[str, Team]:
    """Idempotent team seed for Provintell's 6-team structure.

    Returns {team_key: Team} so callers can link employees by stable key.
    Includes self-nesting (L2 under Standby).
    """
    out: dict[str, Team] = {}
    spec = [
        ("lead", "Team Lead", None, None),
        ("focus", "Team Focus", None, None),
        ("commitment", "Team Commitment", None, None),
        ("standby", "24x7 Standby", None, 2),
        ("l2", "Level 2 CyberLAB", "standby", None),
        ("l3", "Level 3 CloudOps", None, None),
    ]
    for sort_order, (key, name, parent_key, min_hc) in enumerate(spec):
        parent = out.get(parent_key) if parent_key else None
        t, _ = Team.all_objects.update_or_create(
            org_id=org.id,
            name=name,
            defaults={
                "parent_team": parent,
                "sort_order": sort_order,
                "min_headcount": min_hc,
            },
        )
        out[key] = t
    return out


def _ensure_employee(
    org: Organization,
    dept: Department,
    code: str,
    **kwargs,
) -> Employee:
    defaults = {
        "first_name": kwargs.get("first_name", code),
        "last_name": kwargs.get("last_name", "Provintell"),
        "email": kwargs.get("email", f"{code.lower()}@provintell.local"),
        "phone": kwargs.get("phone", "+60123456789"),
        "date_of_birth": kwargs.get("date_of_birth", datetime.date(1990, 1, 1)),
        "gender": kwargs.get("gender", "other"),
        "nationality": "MY",
        "marital_status": "single",
        "address_line1": "Provintell HQ",
        "city": "Petaling Jaya",
        "state": "Selangor",
        "postcode": "46050",
        "country_code": "MY",
        "department": dept,
        "manager": kwargs.get("manager"),
        "role_title": kwargs.get("role_title", "Engineer"),
        "employment_type": "fulltime",
        "schedule_type": kwargs.get("schedule_type", "fixed"),
        "hire_date": kwargs.get("hire_date", datetime.date(2024, 1, 1)),
        "bank_name": "Maybank",
        "emergency_contact_name": "Family",
        "emergency_contact_relationship": "spouse",
        "emergency_contact_phone": "+60123456788",
        "user": kwargs.get("user"),
        "team": kwargs.get("team"),
        "status": "active",
    }
    emp, _ = Employee.all_objects.update_or_create(
        org_id=org.id,
        employee_code=code,
        defaults=defaults,
    )
    return emp


def _ensure_demo_user(
    org: Organization,
    email: str,
    password: str,
    role_code: str,
) -> User:
    user, created = User.objects.get_or_create(
        email=email,
        org_id=org.id,
        defaults={"is_staff": role_code == "org_admin"},
    )
    if created:
        user.set_password(password)
        user.save()
    role = Role.objects.filter(org_id=org.id, code=role_code).first()
    if role and not UserRole.objects.filter(user=user, role=role).exists():
        UserRole.objects.create(user=user, role=role, granted_by=None)
    return user


class Command(BaseCommand):
    help = "Seed Provintell org with realistic demo data for launch."

    def add_arguments(self, parser):
        parser.add_argument(
            "--prod",
            action="store_true",
            help="Skip demo accounts; real users only.",
        )
        parser.add_argument(
            "--no-employees",
            action="store_true",
            help="Skip the 5 demo Employee rows and the leave-balance prefund. "
            "Org, roles, holidays, leave types (and demo logins unless --prod) "
            "are still created.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        is_prod = options["prod"]
        no_employees = options["no_employees"]

        # 1. Country reference data (federal MY 2026 holidays + leave-type defaults)
        self.stdout.write("Loading MY country reference...")
        call_command("seed_country_reference_data", "--country", "MY")

        # 2. Org + departments + teams
        self.stdout.write("Creating Provintell org + departments + teams...")
        org = _ensure_org()
        depts = _ensure_departments(org)
        teams = _ensure_teams(org)

        # 3. Permissions catalogue + default roles
        self.stdout.write("Seeding permissions + roles...")
        call_command("seed_permission_catalogue")
        call_command("seed_default_roles", "--org-id", str(org.id))

        # 4. Holidays + leave types
        call_command(
            "seed_holidays_from_country",
            "--org-id",
            str(org.id),
            "--year",
            "2026",
        )
        call_command("seed_leave_types_from_country", "--org-id", str(org.id))

        # 5. Demo users (skipped in --prod)
        if not is_prod:
            self.stdout.write("Creating demo accounts...")
            # One login per default role so a per-role RBAC smoke check
            # (CLAUDE.md §3.16) can exercise all 7 roles. employee/team_lead are
            # linked to real Employee rows below so their self-service pages
            # (leave, cert/me, training/me — filtered by Employee.id) show data.
            for email, role_code in [
                ("admin@provintell.demo", "org_admin"),
                ("hr@provintell.demo", "hr_manager"),
                ("finance@provintell.demo", "finance"),
                ("ops.lead@provintell.demo", "manager"),
                ("eng.lead@provintell.demo", "manager"),
                ("team.lead@provintell.demo", "team_lead"),
                ("employee@provintell.demo", "employee"),
                ("auditor@provintell.demo", "auditor"),
            ]:
                _ensure_demo_user(org, email, "Demo!2026", role_code)

        # 6. 5 employees (manager hierarchy: ops_lead + eng_lead at top; 3 reports)
        if no_employees:
            self.stdout.write("Skipping demo employees (--no-employees).")
        else:
            self.stdout.write("Creating Provintell employees...")
            u_ops_lead = (
                User.objects.filter(email="ops.lead@provintell.demo", org_id=org.id).first()
                if not is_prod
                else None
            )
            u_eng_lead = (
                User.objects.filter(email="eng.lead@provintell.demo", org_id=org.id).first()
                if not is_prod
                else None
            )
            u_employee = (
                User.objects.filter(email="employee@provintell.demo", org_id=org.id).first()
                if not is_prod
                else None
            )
            u_team_lead = (
                User.objects.filter(email="team.lead@provintell.demo", org_id=org.id).first()
                if not is_prod
                else None
            )

            ops_lead = _ensure_employee(
                org,
                depts["ops"],
                "PVT-OPS-001",
                first_name="Ops",
                last_name="Lead",
                role_title="SOC Lead",
                user=u_ops_lead,
                team=teams["lead"],
            )
            eng_lead = _ensure_employee(
                org,
                depts["eng"],
                "PVT-ENG-001",
                first_name="Eng",
                last_name="Lead",
                role_title="Engineering Lead",
                user=u_eng_lead,
                team=teams["l3"],
            )
            _ensure_employee(
                org,
                depts["ops"],
                "PVT-OPS-002",
                first_name="Analyst",
                last_name="One",
                manager=ops_lead,
                schedule_type="shift",
                role_title="SOC Analyst",
                team=teams["focus"],
                user=u_employee,
            )
            _ensure_employee(
                org,
                depts["ops"],
                "PVT-OPS-003",
                first_name="Analyst",
                last_name="Two",
                manager=ops_lead,
                schedule_type="shift",
                role_title="SOC Analyst",
                team=teams["commitment"],
            )
            _ensure_employee(
                org,
                depts["eng"],
                "PVT-ENG-002",
                first_name="Dev",
                last_name="One",
                manager=eng_lead,
                role_title="Software Engineer",
                team=teams["l2"],
                user=u_team_lead,
            )

            # Department head links
            depts["ops"].head_employee_id = ops_lead.id
            depts["ops"].save()
            depts["eng"].head_employee_id = eng_lead.id
            depts["eng"].save()

        # 7. 2 shifts
        self.stdout.write("Seeding shifts...")
        Shift.all_objects.update_or_create(
            org_id=org.id,
            name="Day",
            defaults={
                "code": "D",
                "start_time": datetime.time(9, 0),
                "end_time": datetime.time(18, 0),
                "crosses_midnight": False,
                "color": "#3B82F6",
            },
        )
        Shift.all_objects.update_or_create(
            org_id=org.id,
            name="Night",
            defaults={
                "code": "N",
                "start_time": datetime.time(22, 0),
                "end_time": datetime.time(7, 0),
                "crosses_midnight": True,
                "color": "#1E40AF",
            },
        )

        # 8. Pre-fund leave balances (annual 14 days for everyone in 2026)
        if not no_employees:
            self.stdout.write("Pre-funding annual leave balances...")
            annual = LeaveType.all_objects.filter(org_id=org.id, code="ANNUAL").first()
            if annual:
                for emp in Employee.all_objects.filter(org_id=org.id, deleted_at__isnull=True):
                    BalanceService.accrue(
                        org_id=org.id,
                        employee_id=emp.id,
                        leave_type=annual,
                        year=2026,
                        days=Decimal("14"),
                        reason="accrual",
                        reference_type="seed",
                        reference_id=emp.id,
                    )

        self.stdout.write(
            self.style.SUCCESS(
                f"Provintell seed complete (prod={is_prod}, no_employees={no_employees})."
            )
        )
