"""Seed a varied set of PENDING approvals for one manager, so the Approvals page
can be exercised end-to-end: the Claims / Leave / KPI tabs, plus the Overdue and
High-value lens chips on Claims.

Everything is routed to a single approver (default: Ahmad, ``pvt-demo-001``) via
their direct reports, and left in a pending/awaiting state (submitted, not acted).
All rows carry the ``[SEED-APPROVALS]`` marker and creation is idempotent — a
re-run only tops up what's missing.

    manage.py seed_approvals_demo
    manage.py seed_approvals_demo --approver pvt-demo-002@provintell.local
"""

from __future__ import annotations

import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from modules.claims.models import ClaimCategory, ClaimRequest
from modules.claims.services.claim_request import ClaimRequestService
from modules.employee.models import Employee
from modules.kpi.models import KpiAssignment, KpiCycle
from modules.kpi.services.cycle import CycleService
from modules.kpi.services.review import ReviewService
from modules.leave.models import LeaveRequest, LeaveType
from modules.leave.services.leave_request import LeaveRequestService

SEED_TAG = "[SEED-APPROVALS]"


def _seed_category(org_id) -> ClaimCategory:
    cat, _ = ClaimCategory.all_objects.update_or_create(
        org_id=org_id,
        code="SEED_APPROVALS",
        defaults={
            "name": "Approvals Test",
            "requires_attachment": False,
            "max_amount_per_claim": Decimal("100000"),
            "currency_code": "MYR",
        },
    )
    return cat


def _ensure_claim(
    org_id, emp: Employee, cat: ClaimCategory, amount: Decimal, merchant: str, days_ago: int
) -> tuple[ClaimRequest, bool]:
    """A claim submitted `days_ago` days ago, awaiting its first (manager) stage.
    `days_ago` > 3 makes it overdue; amount >= 5000 makes it high-value."""
    existing = ClaimRequest.all_objects.filter(
        org_id=org_id, employee=emp, category=cat, merchant=merchant
    ).first()
    if existing:
        return existing, False
    today = timezone.localdate()
    claim = ClaimRequest.all_objects.create(
        org_id=org_id,
        employee=emp,
        category=cat,
        amount=amount,
        currency_code="MYR",
        expense_date=today - datetime.timedelta(days=days_ago + 1),
        description=f"{SEED_TAG} test claim",
        merchant=merchant,
        status="draft",
        current_level=0,
    )
    ClaimRequestService.submit(claim, actor=emp.user)
    if days_ago > 0:
        backdated = timezone.now() - datetime.timedelta(days=days_ago)
        ClaimRequest.all_objects.filter(id=claim.id).update(submitted_at=backdated)
    return claim, True


def _ensure_leave(
    org_id, emp: Employee, ltype: LeaveType, start: datetime.date, end: datetime.date
) -> tuple[LeaveRequest, bool]:
    existing = LeaveRequest.all_objects.filter(
        org_id=org_id, employee_id=emp.id, leave_type=ltype, start_date=start
    ).first()
    if existing:
        return existing, False
    total = Decimal((end - start).days + 1)
    req = LeaveRequest.all_objects.create(
        org_id=org_id,
        employee_id=emp.id,
        leave_type=ltype,
        start_date=start,
        end_date=end,
        total_days=total,
        reason=f"{SEED_TAG} test leave",
        status="draft",
        current_level=0,
    )
    LeaveRequestService.submit(req, actor=emp.user)
    return req, True


def _ensure_self_review(cycle: KpiCycle, emp: Employee) -> bool:
    """Submit a self-review for `emp` if the assignment hasn't got one. Requires the
    cycle to be in self_review. Returns True when a review was newly submitted."""
    assignment = KpiAssignment.all_objects.filter(
        cycle=cycle, employee_id=emp.id, deleted_at__isnull=True
    ).first()
    if assignment is None or assignment.reviews.filter(stage="self").exists():
        return False
    scores = {
        "TASK_COMPLETION": {"score": "88", "comment": f"{SEED_TAG} on track"},
        "INCIDENTS_RESOLVED": {"score": "47", "comment": f"{SEED_TAG} good progress"},
        "CUSTOMER_SATISFACTION": {"score": "4.3", "comment": f"{SEED_TAG} positive"},
        "TRAINING_HOURS": {"score": "14", "comment": f"{SEED_TAG} completed"},
    }
    ReviewService.submit_self(
        assignment,
        submitted_by=emp.id,
        scores=scores,
        overall_comment=f"{SEED_TAG} self review for manager approval",
    )
    return True


def _count_manager_pending(cycle: KpiCycle, reports: list[Employee]) -> int:
    """Reports whose assignment is self_done — these surface in the manager's inbox
    once the cycle is in manager_review."""
    ids = [r.id for r in reports]
    return KpiAssignment.all_objects.filter(
        cycle=cycle, employee_id__in=ids, status="self_done", deleted_at__isnull=True
    ).count()


class Command(BaseCommand):
    help = "Seed varied pending approvals (claims/leave/KPI) for one manager's inbox."

    def add_arguments(self, parser):
        parser.add_argument(
            "--approver",
            default="pvt-demo-001@provintell.local",
            help="Login email of the manager whose reports' items should be seeded.",
        )
        parser.add_argument(
            "--all",
            action="store_true",
            help="Seed pending items for EVERY employee with a manager (busy-inbox demo).",
        )
        parser.add_argument(
            "--claims-per", type=int, default=3, help="Claims per employee in --all mode."
        )
        parser.add_argument(
            "--leave-per", type=int, default=2, help="Leave requests per employee in --all mode."
        )

    @transaction.atomic
    def handle(self, *args, **opts):
        if opts["all"]:
            self._seed_all(opts["claims_per"], opts["leave_per"])
            return
        approver = Employee.all_objects.filter(user__email=opts["approver"]).first()
        if approver is None:
            raise CommandError(f"No employee found for approver {opts['approver']!r}")
        reports = list(
            Employee.all_objects.filter(
                manager=approver, deleted_at__isnull=True, user__isnull=False
            ).order_by("employee_code")
        )
        if len(reports) < 3:
            raise CommandError(
                f"{approver.employee_code} needs >=3 direct reports with users; "
                f"found {len(reports)}"
            )
        org_id = approver.org_id
        r1, r2, r3 = reports[0], reports[1], reports[2]

        cat = _seed_category(org_id)
        today = timezone.localdate()
        created = {"claims": 0, "leave": 0, "kpi": 0}

        # Claims — one of each flavour so Overdue + High-value lenses have data.
        _, c1 = _ensure_claim(org_id, r1, cat, Decimal("320.00"), "SEED Grab Malaysia", days_ago=1)
        _, c2 = _ensure_claim(org_id, r2, cat, Decimal("7500.00"), "SEED Dell Malaysia", days_ago=2)
        _, c3 = _ensure_claim(org_id, r3, cat, Decimal("900.00"), "SEED Petronas", days_ago=6)
        created["claims"] = sum((c1, c2, c3))

        # Leave — two pending annual requests, future-dated.
        annual = LeaveType.all_objects.filter(org_id=org_id, code="ANNUAL").first()
        if annual is not None:
            _, l1 = _ensure_leave(
                org_id,
                r1,
                annual,
                today + datetime.timedelta(days=20),
                today + datetime.timedelta(days=22),
            )
            _, l2 = _ensure_leave(
                org_id,
                r3,
                annual,
                today + datetime.timedelta(days=30),
                today + datetime.timedelta(days=31),
            )
            created["leave"] = sum((l1, l2))

        # KPI — self-reviews for the reports, then open manager review so those
        # reviews land in the manager's inbox (inbox needs cycle=manager_review +
        # assignment=self_done).
        cycle = (
            KpiCycle.all_objects.filter(org_id=org_id, status__in=("self_review", "manager_review"))
            .order_by("-created_at")
            .first()
        )
        if cycle is None:
            self.stdout.write("  KPI: no self_review/manager_review cycle — skipped")
        else:
            if cycle.status == "self_review":
                for r in (r1, r2, r3):
                    _ensure_self_review(cycle, r)
                CycleService.transition(cycle, "manager_review")
                cycle.refresh_from_db()
                self.stdout.write(f"  KPI: cycle {cycle.name!r} moved to manager_review")
            created["kpi"] = _count_manager_pending(cycle, reports)

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded for {approver.employee_code} ({opts['approver']}): "
                f"+{created['claims']} claims, +{created['leave']} leave, +{created['kpi']} KPI "
                f"(existing items are left as-is)."
            )
        )

    def _seed_all(self, claims_per: int, leave_per: int) -> None:
        """Give every employee-with-manager several pending claims + leave requests, in
        a realistic mix, so any manager's Approvals inbox looks busy. Each item is
        isolated in a savepoint so one bad row (e.g. missing leave balance) is skipped,
        not fatal. Nothing is approved."""
        employees = list(
            Employee.all_objects.filter(
                deleted_at__isnull=True, manager__isnull=False, user__isnull=False
            ).order_by("employee_code")
        )
        if not employees:
            raise CommandError("No employees with a manager + user account to seed.")

        today = timezone.localdate()
        cat_by_org: dict = {}
        annual_by_org: dict = {}
        totals = {"claims": 0, "leave": 0, "skipped": 0}

        for idx, emp in enumerate(employees):
            org_id = emp.org_id
            cat = cat_by_org.setdefault(org_id, _seed_category(org_id))
            annual = annual_by_org.setdefault(
                org_id, LeaveType.all_objects.filter(org_id=org_id, code="ANNUAL").first()
            )

            for j in range(claims_per):
                gi = idx * claims_per + j
                if gi % 6 == 0:  # high-value (>= RM 5,000)
                    amount, days_ago = Decimal(5000 + (gi % 5) * 720), 2
                elif gi % 4 == 0:  # overdue
                    amount, days_ago = Decimal(500 + (gi % 9) * 190), 4 + (gi % 5)
                else:  # everyday
                    amount, days_ago = Decimal(80 + (gi % 12) * 95), gi % 3
                merchant = f"SEED-{emp.employee_code}-C{j}"
                try:
                    with transaction.atomic():
                        _, made = _ensure_claim(
                            org_id, emp, cat, amount, merchant, days_ago=days_ago
                        )
                    totals["claims"] += int(made)
                except Exception:
                    totals["skipped"] += 1

            if annual is not None:
                for k in range(leave_per):
                    start = today + datetime.timedelta(days=15 + idx * 3 + k * 11)
                    end = start + datetime.timedelta(days=k)  # 1- or 2-day requests
                    try:
                        with transaction.atomic():
                            _, made = _ensure_leave(org_id, emp, annual, start, end)
                        totals["leave"] += int(made)
                    except Exception:
                        totals["skipped"] += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded across {len(employees)} employees: +{totals['claims']} claims, "
                f"+{totals['leave']} leave ({totals['skipped']} rows skipped — already present "
                f"or no balance). Nothing approved."
            )
        )
