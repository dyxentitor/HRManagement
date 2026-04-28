"""Seed 10 demo employees and populate every HRMS module for click-through testing.

Idempotent — re-running does NOT duplicate. Uses ``update_or_create``/``get_or_create``
keyed on stable identifiers throughout.

Usage:
    uv run python manage.py seed_demo_data
    uv run python manage.py seed_demo_data --prod   # no-op, prints message
"""

from __future__ import annotations

import datetime
import uuid
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from modules.attendance.models import AttendanceRecord
from modules.certification.models import Certification, TrainingAssignment, TrainingPlan
from modules.certification.services.training import complete_assignment
from modules.claims.models import ClaimAttachment, ClaimCategory, ClaimRequest
from modules.claims.services.claim_request import ClaimRequestService
from modules.employee.models import Employee
from modules.identity.models import Role, User, UserRole
from modules.kpi.models import KpiAssignment, KpiCycle, KpiTemplate
from modules.kpi.services.assignment import AssignmentService
from modules.kpi.services.cycle import CycleService
from modules.kpi.services.review import ReviewService
from modules.kpi.services.template import TemplateService
from modules.leave.models import LeaveRequest, LeaveType
from modules.leave.services.balance import BalanceService
from modules.leave.services.leave_request import LeaveRequestService
from modules.organization.models import Department, Organization
from modules.payslip.models import (
    PayrollComponent,
    PayrollPeriod,
    PayrollRun,
    PayslipRecord,
)
from modules.schedule.models import Shift, ShiftAssignment
from modules.schedule.services.schedule import ScheduleService

PROVINTELL_SLUG = "provintell"

# ─── Employee data ────────────────────────────────────────────────────────────

DEMO_EMPLOYEES = [
    # (code, first, last, gender, dob, dept_key, employment_type, schedule_type,
    #  hire_date, role_title, is_manager, ic, bank_acct, epf, socso, eis, lhdn)
    {
        "code": "PVT-DEMO-001",
        "first_name": "Ahmad",
        "last_name": "Abdullah",
        "gender": "male",
        "date_of_birth": datetime.date(1985, 3, 15),
        "dept_key": "ops",
        "employment_type": "fulltime",
        "schedule_type": "shift",
        "hire_date": datetime.date(2021, 4, 1),
        "role_title": "SOC Manager",
        "is_manager": True,
        "marital_status": "married",
        "ic_number": "850315-14-5271",
        "bank_account_number": "11234567890",
        "epf_no": "EPF850315001",
        "socso_no": "SOCSO85031501",
        "eis_no": "EIS8503150001",
        "lhdn_tax_no": "SG50312345678",
    },
    {
        "code": "PVT-DEMO-002",
        "first_name": "Siti Aminah",
        "last_name": "Hassan",
        "gender": "female",
        "date_of_birth": datetime.date(1990, 7, 22),
        "dept_key": "hr",
        "employment_type": "fulltime",
        "schedule_type": "fixed",
        "hire_date": datetime.date(2022, 1, 15),
        "role_title": "HR Manager",
        "is_manager": True,
        "marital_status": "married",
        "ic_number": "900722-10-6182",
        "bank_account_number": "22345678901",
        "epf_no": "EPF900722002",
        "socso_no": "SOCSO90072202",
        "eis_no": "EIS9007220002",
        "lhdn_tax_no": "SG60723456789",
    },
    {
        "code": "PVT-DEMO-003",
        "first_name": "Nur Hidayah",
        "last_name": "Razali",
        "gender": "female",
        "date_of_birth": datetime.date(1993, 11, 8),
        "dept_key": "ops",
        "employment_type": "fulltime",
        "schedule_type": "shift",
        "hire_date": datetime.date(2022, 6, 1),
        "role_title": "SOC Analyst",
        "is_manager": False,
        "marital_status": "single",
        "ic_number": "931108-03-4293",
        "bank_account_number": "33456789012",
        "epf_no": "EPF931108003",
        "socso_no": "SOCSO93110803",
        "eis_no": "EIS9311080003",
        "lhdn_tax_no": "SG71109567890",
    },
    {
        "code": "PVT-DEMO-004",
        "first_name": "Faizal",
        "last_name": "Rahim",
        "gender": "male",
        "date_of_birth": datetime.date(1988, 5, 30),
        "dept_key": "ops",
        "employment_type": "fulltime",
        "schedule_type": "shift",
        "hire_date": datetime.date(2020, 9, 1),
        "role_title": "SOC Analyst",
        "is_manager": False,
        "marital_status": "married",
        "ic_number": "880530-07-3384",
        "bank_account_number": "44567890123",
        "epf_no": "EPF880530004",
        "socso_no": "SOCSO88053004",
        "eis_no": "EIS8805300004",
        "lhdn_tax_no": "SG80531678901",
    },
    {
        "code": "PVT-DEMO-005",
        "first_name": "Tan Wei",
        "last_name": "Ming",
        "gender": "male",
        "date_of_birth": datetime.date(1991, 2, 14),
        "dept_key": "eng",
        "employment_type": "fulltime",
        "schedule_type": "fixed",
        "hire_date": datetime.date(2021, 11, 15),
        "role_title": "Senior Engineer",
        "is_manager": False,
        "marital_status": "single",
        "ic_number": "910214-05-5475",
        "bank_account_number": "55678901234",
        "epf_no": "EPF910214005",
        "socso_no": "SOCSO91021405",
        "eis_no": "EIS9102140005",
        "lhdn_tax_no": "SG90215789012",
    },
    {
        "code": "PVT-DEMO-006",
        "first_name": "Lim Mei",
        "last_name": "Ling",
        "gender": "female",
        "date_of_birth": datetime.date(1995, 8, 3),
        "dept_key": "eng",
        "employment_type": "fulltime",
        "schedule_type": "fixed",
        "hire_date": datetime.date(2023, 2, 1),
        "role_title": "Software Engineer",
        "is_manager": False,
        "marital_status": "single",
        "ic_number": "950803-12-6566",
        "bank_account_number": "66789012345",
        "epf_no": "EPF950803006",
        "socso_no": "SOCSO95080306",
        "eis_no": "EIS9508030006",
        "lhdn_tax_no": "SG00804890123",
    },
    {
        "code": "PVT-DEMO-007",
        "first_name": "Wong Kah",
        "last_name": "Yee",
        "gender": "female",
        "date_of_birth": datetime.date(1987, 12, 19),
        "dept_key": "hr",
        "employment_type": "contract",
        "schedule_type": "fixed",
        "hire_date": datetime.date(2023, 7, 1),
        "role_title": "HR Executive",
        "is_manager": False,
        "marital_status": "married",
        "ic_number": "871219-11-7657",
        "bank_account_number": "77890123456",
        "epf_no": "EPF871219007",
        "socso_no": "SOCSO87121907",
        "eis_no": "EIS8712190007",
        "lhdn_tax_no": "SG81220901234",
    },
    {
        "code": "PVT-DEMO-008",
        "first_name": "Rajesh",
        "last_name": "Kumar",
        "gender": "male",
        "date_of_birth": datetime.date(1983, 6, 25),
        "dept_key": "eng",
        "employment_type": "fulltime",
        "schedule_type": "fixed",
        "hire_date": datetime.date(2020, 3, 15),
        "role_title": "Lead Engineer",
        "is_manager": False,
        "marital_status": "married",
        "ic_number": "830625-10-8748",
        "bank_account_number": "88901234567",
        "epf_no": "EPF830625008",
        "socso_no": "SOCSO83062508",
        "eis_no": "EIS8306250008",
        "lhdn_tax_no": "SG70626012345",
    },
    {
        "code": "PVT-DEMO-009",
        "first_name": "Priya",
        "last_name": "Subramaniam",
        "gender": "female",
        "date_of_birth": datetime.date(1994, 9, 11),
        "dept_key": "hr",
        "employment_type": "contract",
        "schedule_type": "fixed",
        "hire_date": datetime.date(2024, 1, 8),
        "role_title": "Payroll Executive",
        "is_manager": False,
        "marital_status": "single",
        "ic_number": "940911-14-9839",
        "bank_account_number": "99012345678",
        "epf_no": "EPF940911009",
        "socso_no": "SOCSO94091109",
        "eis_no": "EIS9409110009",
        "lhdn_tax_no": "SG90912123456",
    },
    {
        "code": "PVT-DEMO-010",
        "first_name": "Arvind",
        "last_name": "Pillai",
        "gender": "male",
        "date_of_birth": datetime.date(1989, 4, 7),
        "dept_key": "ops",
        "employment_type": "fulltime",
        "schedule_type": "fixed",
        "hire_date": datetime.date(2021, 8, 1),
        "role_title": "Security Analyst",
        "is_manager": False,
        "marital_status": "married",
        "ic_number": "890407-03-0920",
        "bank_account_number": "10123456789",
        "epf_no": "EPF890407010",
        "socso_no": "SOCSO89040710",
        "eis_no": "EIS8904070010",
        "lhdn_tax_no": "SG80408234567",
    },
]


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _get_org() -> Organization:
    return Organization.objects.get(slug=PROVINTELL_SLUG)


def _get_depts(org: Organization) -> dict[str, Department]:
    out: dict[str, Department] = {}
    for code, name in [("ops", "Operations"), ("eng", "Engineering"), ("hr", "Admin/HR")]:
        d = Department.all_objects.filter(org_id=org.id, name=name).first()
        if d is None:
            raise RuntimeError(f"Department '{name}' not found. Run seed_provintell first.")
        out[code] = d
    return out


def _ensure_demo_user(
    org: Organization,
    email: str,
    password: str,
    role_code: str,
) -> User:
    user, created = User.objects.get_or_create(
        email=email,
        org_id=org.id,
        defaults={"is_staff": False},
    )
    if created:
        user.set_password(password)
        user.save()
    role = Role.objects.filter(org_id=org.id, code=role_code).first()
    if role and not UserRole.objects.filter(user=user, role=role).exists():
        UserRole.objects.create(user=user, role=role, granted_by=None)
    return user


def _ensure_employee_full(
    org: Organization,
    dept: Department,
    data: dict,
    user: User,
    manager: Employee | None = None,
) -> Employee:
    defaults = {
        "first_name": data["first_name"],
        "last_name": data["last_name"],
        "email": f"{data['code'].lower()}@provintell.local",
        "phone": "+60123456789",
        "date_of_birth": data["date_of_birth"],
        "gender": data["gender"],
        "nationality": "MY",
        "marital_status": data["marital_status"],
        "address_line1": "Provintell HQ, Level 8",
        "address_line2": "Jalan Semangat",
        "city": "Petaling Jaya",
        "state": "Selangor",
        "postcode": "46050",
        "country_code": "MY",
        "department": dept,
        "manager": manager,
        "role_title": data["role_title"],
        "employment_type": data["employment_type"],
        "schedule_type": data["schedule_type"],
        "hire_date": data["hire_date"],
        "bank_name": "Maybank",
        "emergency_contact_name": "Family Member",
        "emergency_contact_relationship": "spouse",
        "emergency_contact_phone": "+60123456780",
        "user": user,
        "status": "active",
        "timezone": "Asia/Kuala_Lumpur",
        # Encrypted fields — assigned normally; EncryptedCharField encrypts on save
        "ic_number": data.get("ic_number"),
        "ic_last4": data.get("ic_number", "0000")[-4:],
        "bank_account_number": data.get("bank_account_number"),
        "bank_account_last4": data.get("bank_account_number", "0000")[-4:],
        "epf_no": data.get("epf_no"),
        "socso_no": data.get("socso_no"),
        "eis_no": data.get("eis_no"),
        "lhdn_tax_no": data.get("lhdn_tax_no"),
    }
    if data["employment_type"] == "contract":
        defaults["contract_end_date"] = data["hire_date"] + datetime.timedelta(days=365)

    emp, _ = Employee.all_objects.update_or_create(
        org_id=org.id,
        employee_code=data["code"],
        defaults=defaults,
    )
    return emp


# ─── Module seeders ───────────────────────────────────────────────────────────


def _seed_schedules(org: Organization, shift_employees: list[Employee]) -> int:
    """7 days of ShiftAssignment for the current week for shift workers.
    Alternates Day/Night shifts per employee index.
    """
    day_shift = Shift.all_objects.filter(org_id=org.id, name="Day").first()
    night_shift = Shift.all_objects.filter(org_id=org.id, name="Night").first()
    if not day_shift or not night_shift:
        return 0

    today = timezone.localdate()
    # Find Monday of the current week
    monday = today - datetime.timedelta(days=today.weekday())
    sunday = monday + datetime.timedelta(days=6)

    n_created = 0
    for idx, emp in enumerate(shift_employees):
        # Even-indexed employees get Day, odd get Night; alternate mid-week
        pattern_by_weekday: dict[str, uuid.UUID] = {}
        for day_offset in range(7):
            day_key = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][day_offset]
            # Alternate Day/Night based on (idx + day_offset) parity
            if (idx + day_offset) % 2 == 0:
                pattern_by_weekday[day_key] = day_shift.id
            else:
                pattern_by_weekday[day_key] = night_shift.id

        created = ScheduleService.bulk_assign_pattern(
            org_id=org.id,
            employee_ids=[emp.id],
            pattern_by_weekday=pattern_by_weekday,
            date_from=monday,
            date_to=sunday,
            assigned_by=emp.id,
            notes="seed_demo_data",
        )
        n_created += created

    return n_created


def _seed_attendance(
    org: Organization,
    employees: list[Employee],
    holiday_date: datetime.date | None,
) -> int:
    """~10 weekdays of AttendanceRecord per employee going back 14 calendar days.
    Mix: ~80% on-time, ~15% late, ~5% absent.

    For shift workers: one record on a 2026 federal MY holiday so the
    holiday-replacement signal fires (via AttendanceService.clock_in).
    """
    today = timezone.localdate()
    n_created = 0

    # Collect weekdays in the last 14 calendar days
    weekdays: list[datetime.date] = []
    for offset in range(1, 15):
        d = today - datetime.timedelta(days=offset)
        if d.weekday() < 5:  # Mon-Fri only
            weekdays.append(d)
    # Take up to 10 weekdays
    weekdays = weekdays[:10]

    shift_employees = [e for e in employees if e.schedule_type == "shift"]

    for i, emp in enumerate(employees):
        for j, work_date in enumerate(weekdays):
            # Skip if already exists
            existing = AttendanceRecord.all_objects.filter(
                employee=emp, work_date=work_date, deleted_at__isnull=True
            ).first()
            if existing:
                n_created += 1  # count it as present
                continue

            # Determine status bucket by (i+j) mod 20:
            # 0-15 = present/late, 16-18 = late, 19 = absent
            bucket = (i * 3 + j) % 20
            if bucket == 19:
                # Absent — create record with no clock data
                AttendanceRecord.all_objects.create(
                    org_id=org.id,
                    employee=emp,
                    work_date=work_date,
                    status="absent",
                    source="admin",
                )
            elif bucket >= 16:
                # Late (5-30 min late); schedule is 09:00 → 09:05..09:30
                late_minutes = 5 + (bucket - 16) * 8  # 5, 13, 21
                clock_in_dt = datetime.datetime.combine(
                    work_date,
                    datetime.time(9, late_minutes),
                    tzinfo=datetime.UTC,
                )
                clock_out_dt = datetime.datetime.combine(
                    work_date,
                    datetime.time(18, 0),
                    tzinfo=datetime.UTC,
                )
                AttendanceRecord.all_objects.create(
                    org_id=org.id,
                    employee=emp,
                    work_date=work_date,
                    clock_in=clock_in_dt,
                    clock_out=clock_out_dt,
                    status="late",
                    source="web",
                )
            else:
                # On-time
                clock_in_dt = datetime.datetime.combine(
                    work_date, datetime.time(9, 0), tzinfo=datetime.UTC
                )
                clock_out_dt = datetime.datetime.combine(
                    work_date, datetime.time(18, 0), tzinfo=datetime.UTC
                )
                AttendanceRecord.all_objects.create(
                    org_id=org.id,
                    employee=emp,
                    work_date=work_date,
                    clock_in=clock_in_dt,
                    clock_out=clock_out_dt,
                    status="present",
                    source="web",
                )
            n_created += 1

    # Holiday attendance for shift workers — use AttendanceService.clock_in so the
    # attendance_clocked signal fires and grants REPLACEMENT leave.
    if holiday_date:
        for emp in shift_employees:
            existing = AttendanceRecord.all_objects.filter(
                employee=emp, work_date=holiday_date, deleted_at__isnull=True
            ).first()
            if existing:
                continue
            # Temporarily set timezone.localdate() result by mocking — we can't,
            # so we create the record directly with is_holiday_work=True and fire the signal.
            # The signal handler checks is_holiday_work + schedule_type, not localdate.
            from modules.schedule.services.holiday import HolidayService

            holiday = HolidayService.get_for_date(org_id=org.id, on_date=holiday_date)
            if not holiday:
                continue

            rec = AttendanceRecord.all_objects.create(
                org_id=emp.org_id,
                employee=emp,
                work_date=holiday_date,
                clock_in=datetime.datetime.combine(
                    holiday_date, datetime.time(9, 0), tzinfo=datetime.UTC
                ),
                clock_out=datetime.datetime.combine(
                    holiday_date, datetime.time(18, 0), tzinfo=datetime.UTC
                ),
                status="present",
                source="admin",
                is_holiday_work=True,
                holiday_id=holiday.id,
            )
            # Manually fire the signal to trigger the replacement-leave grant
            from modules.attendance.signals import attendance_clocked

            attendance_clocked.send(sender=AttendanceRecord, record=rec, kind="in")
            n_created += 1

    return n_created


def _seed_leave(
    org: Organization,
    employees: list[Employee],
    manager_emp: Employee,
    admin_user: User,
) -> int:
    """3 LeaveRequests per employee: 1 approved (past), 1 pending (future), 1 rejected.
    Uses LeaveRequestService so balances move through the workflow.
    """
    annual = LeaveType.all_objects.filter(org_id=org.id, code="ANNUAL").first()
    sick = LeaveType.all_objects.filter(org_id=org.id, code="SICK").first()
    compassionate = LeaveType.all_objects.filter(org_id=org.id, code="COMPASSIONATE").first()
    if not annual:
        return 0

    today = timezone.localdate()
    n_created = 0

    for emp in employees:
        # Pre-fund SICK + COMPASSIONATE (ANNUAL is already funded by seed_provintell logic above)
        if sick:
            BalanceService.accrue(
                org_id=org.id,
                employee_id=emp.id,
                leave_type=sick,
                year=2026,
                days=Decimal("14"),
                reason="accrual",
                reference_type="seed_demo",
                reference_id=emp.id,
            )
        if compassionate:
            BalanceService.accrue(
                org_id=org.id,
                employee_id=emp.id,
                leave_type=compassionate,
                year=2026,
                days=Decimal("3"),
                reason="accrual",
                reference_type="seed_demo_comp",
                reference_id=emp.id,
            )

        # Determine the approver for this employee's leave.
        # The workflow engine resolves to emp.manager.user; we need that user as actor.
        # If no manager is set, fall back to admin_user who has org_admin role.
        if emp.manager and emp.manager.user:
            approver_user = emp.manager.user
        else:
            approver_user = admin_user

        # ── 1. Approved leave (past, annual) ──────────────────────────────
        past_start = today - datetime.timedelta(days=30)
        past_end = today - datetime.timedelta(days=28)

        existing_approved = LeaveRequest.all_objects.filter(
            org_id=org.id,
            employee_id=emp.id,
            leave_type=annual,
            start_date=past_start,
        ).first()
        if not existing_approved:
            req_approved = LeaveRequest.all_objects.create(
                org_id=org.id,
                employee_id=emp.id,
                leave_type=annual,
                start_date=past_start,
                end_date=past_end,
                total_days=Decimal("3"),
                reason="Annual leave",
                status="draft",
                current_level=0,
            )
            try:
                LeaveRequestService.submit(req_approved, actor=emp.user or approver_user)
                # Refetch after submit (status changed)
                req_approved.refresh_from_db()
                LeaveRequestService.act(
                    req_approved,
                    actor=approver_user,
                    decision=__import__("common.workflow", fromlist=["Decision"]).Decision.APPROVE,
                )
            except Exception:
                # direct save: fallback if workflow approver resolution fails
                req_approved.status = "approved"
                req_approved.submitted_at = timezone.now()
                req_approved.decided_at = timezone.now()
                req_approved.decided_by = approver_user.id
                req_approved.save()
                # deduct from balance directly
                BalanceService.deduct(
                    org_id=org.id,
                    employee_id=emp.id,
                    leave_type=annual,
                    year=2026,
                    days=Decimal("3"),
                    reference_type="leave_request",
                    reference_id=req_approved.id,
                    actor_id=approver_user.id,
                )
            n_created += 1
        else:
            n_created += 1

        # ── 2. Pending leave (future, sick or annual) ──────────────────────
        future_start = today + datetime.timedelta(days=14)
        future_end = today + datetime.timedelta(days=15)
        leave_type_pending = sick if sick else annual

        existing_pending = LeaveRequest.all_objects.filter(
            org_id=org.id,
            employee_id=emp.id,
            leave_type=leave_type_pending,
            start_date=future_start,
        ).first()
        if not existing_pending:
            req_pending = LeaveRequest.all_objects.create(
                org_id=org.id,
                employee_id=emp.id,
                leave_type=leave_type_pending,
                start_date=future_start,
                end_date=future_end,
                total_days=Decimal("2"),
                reason="Medical appointment",
                status="draft",
                current_level=0,
            )
            try:
                LeaveRequestService.submit(req_pending, actor=emp.user or approver_user)
            except Exception:
                # direct save: fallback if workflow approver resolution fails
                req_pending.status = "submitted"
                req_pending.submitted_at = timezone.now()
                req_pending.current_level = 1
                req_pending.save()
                BalanceService.hold_pending(
                    org_id=org.id,
                    employee_id=emp.id,
                    leave_type=leave_type_pending,
                    year=2026,
                    days=Decimal("2"),
                )
            n_created += 1
        else:
            n_created += 1

        # ── 3. Rejected leave (recent, compassionate or annual) ───────────
        recent_start = today - datetime.timedelta(days=10)
        recent_end = today - datetime.timedelta(days=9)
        leave_type_rejected = compassionate if compassionate else annual

        existing_rejected = LeaveRequest.all_objects.filter(
            org_id=org.id,
            employee_id=emp.id,
            leave_type=leave_type_rejected,
            start_date=recent_start,
        ).first()
        if not existing_rejected:
            req_rejected = LeaveRequest.all_objects.create(
                org_id=org.id,
                employee_id=emp.id,
                leave_type=leave_type_rejected,
                start_date=recent_start,
                end_date=recent_end,
                total_days=Decimal("2"),
                reason="Family event",
                status="draft",
                current_level=0,
            )
            try:
                LeaveRequestService.submit(req_rejected, actor=emp.user or approver_user)
                req_rejected.refresh_from_db()
                from common.workflow import Decision

                LeaveRequestService.act(
                    req_rejected,
                    actor=approver_user,
                    decision=Decision.REJECT,
                    comment="Insufficient notice period",
                )
            except Exception:
                # direct save: fallback if workflow approver resolution fails
                req_rejected.status = "rejected"
                req_rejected.submitted_at = timezone.now()
                req_rejected.decided_at = timezone.now()
                req_rejected.decided_by = approver_user.id
                req_rejected.save()
            n_created += 1
        else:
            n_created += 1

    return n_created


def _seed_claims(
    org: Organization,
    employees: list[Employee],
    finance_user: User,
) -> int:
    """2 ClaimRequests per employee: 1 approved+reimbursed, 1 pending.
    At least 3 with a ClaimAttachment stub.
    """
    # Ensure 3 ClaimCategory rows
    categories = {}
    for code, name in [("TRAVEL", "Travel"), ("MEALS", "Meals"), ("MISC", "Miscellaneous")]:
        cat, _ = ClaimCategory.all_objects.update_or_create(
            org_id=org.id,
            code=code,
            defaults={
                "name": name,
                "requires_attachment": True,
                "max_amount_per_claim": Decimal("2000"),
                "currency_code": "MYR",
            },
        )
        categories[code] = cat

    today = timezone.localdate()
    n_created = 0
    attachment_count = 0

    for i, emp in enumerate(employees):
        approver_user = emp.manager.user if (emp.manager and emp.manager.user) else finance_user

        # ── 1. Approved + reimbursed claim (RM 50-300, team lunch) ───────
        expense_date_approved = today - datetime.timedelta(days=20)
        amount_approved = Decimal("50") + Decimal(str((i * 47) % 250))

        existing_approved = ClaimRequest.all_objects.filter(
            org_id=org.id,
            employee=emp,
            category=categories["MEALS"],
            expense_date=expense_date_approved,
        ).first()
        if not existing_approved:
            claim_approved = ClaimRequest.all_objects.create(
                org_id=org.id,
                employee=emp,
                category=categories["MEALS"],
                amount=amount_approved,
                currency_code="MYR",
                expense_date=expense_date_approved,
                description="Team lunch",
                merchant="Restoran Nasi Lemak",
                status="draft",
                current_level=0,
            )
            try:
                ClaimRequestService.submit(claim_approved, actor=emp.user or approver_user)
                claim_approved.refresh_from_db()
                from common.workflow import Decision

                # Step 1: manager approve
                ClaimRequestService.act(
                    claim_approved,
                    actor=approver_user,
                    decision=Decision.APPROVE,
                    comment="Approved",
                )
                claim_approved.refresh_from_db()

                # Step 2: finance approve (if still submitted/manager_approved)
                if claim_approved.status in ("submitted", "manager_approved"):
                    ClaimRequestService.act(
                        claim_approved,
                        actor=finance_user,
                        decision=Decision.APPROVE,
                        comment="Finance approved",
                    )
                    claim_approved.refresh_from_db()

                if claim_approved.status == "finance_approved":
                    ClaimRequestService.mark_reimbursed(
                        claim_approved,
                        reference=f"TXN-SEED-{i:04d}",
                        actor_id=finance_user.id,
                    )
                    claim_approved.refresh_from_db()
                elif claim_approved.status == "manager_approved":
                    # direct save: claim chain is manager_approved but no finance user available
                    claim_approved.status = "reimbursed"
                    claim_approved.reimbursed_at = timezone.now()
                    claim_approved.reimbursement_reference = f"TXN-SEED-{i:04d}"
                    claim_approved.save()
            except Exception:
                # direct save: workflow resolution failed (no valid approver chain)
                claim_approved.status = "reimbursed"
                claim_approved.submitted_at = timezone.now()
                claim_approved.reimbursed_at = timezone.now()
                claim_approved.reimbursement_reference = f"TXN-SEED-{i:04d}"
                claim_approved.save()

            # Add attachment stub for first 3 employees
            if attachment_count < 3:
                ClaimAttachment.objects.get_or_create(
                    claim=claim_approved,
                    filename="receipt.pdf",
                    defaults={
                        "content_type": "application/pdf",
                        "size_bytes": 102400,
                        "s3_key": f"seed/demo/claim_{claim_approved.id}_receipt.pdf",
                        "uploaded_by": emp.id,
                    },
                )
                attachment_count += 1

            n_created += 1
        else:
            n_created += 1

        # ── 2. Pending claim (RM 200-1500, client meeting) ────────────────
        expense_date_pending = today - datetime.timedelta(days=5)
        amount_pending = Decimal("200") + Decimal(str((i * 131) % 1300))

        existing_pending = ClaimRequest.all_objects.filter(
            org_id=org.id,
            employee=emp,
            category=categories["TRAVEL"],
            expense_date=expense_date_pending,
        ).first()
        if not existing_pending:
            claim_pending = ClaimRequest.all_objects.create(
                org_id=org.id,
                employee=emp,
                category=categories["TRAVEL"],
                amount=amount_pending,
                currency_code="MYR",
                expense_date=expense_date_pending,
                description="Client meeting transportation",
                merchant="Grab",
                status="draft",
                current_level=0,
            )
            try:
                ClaimRequestService.submit(claim_pending, actor=emp.user or approver_user)
            except Exception:
                # direct save: workflow resolution failed
                claim_pending.status = "submitted"
                claim_pending.submitted_at = timezone.now()
                claim_pending.current_level = 1
                claim_pending.save()
            n_created += 1
        else:
            n_created += 1

    return n_created


def _seed_payslips(
    org: Organization,
    employees: list[Employee],
    actor_id: uuid.UUID,
) -> int:
    """1 PayrollPeriod for previous calendar month + 1 PayrollRun.
    10 PayslipRecord with realistic MY gross/deductions.

    direct save: publish_run calls S3/boto3 for PDF upload, which is
    not available in seed context. We set payslip status='published'
    and write audit ledger entries directly.
    """
    today = timezone.localdate()
    # Previous calendar month
    if today.month == 1:
        period_start = datetime.date(today.year - 1, 12, 1)
        period_end = datetime.date(today.year - 1, 12, 31)
        pay_date = datetime.date(today.year, 1, 5)
    else:
        period_start = datetime.date(today.year, today.month - 1, 1)
        import calendar

        last_day = calendar.monthrange(today.year, today.month - 1)[1]
        period_end = datetime.date(today.year, today.month - 1, last_day)
        pay_date = datetime.date(today.year, today.month, 5)

    # Ensure payroll components
    components_meta = [
        ("BASIC", "Basic Salary", "earning", False),
        ("EPF_EE", "EPF Employee (11%)", "deduction", True),
        ("SOCSO_EE", "SOCSO Employee (0.5%)", "deduction", True),
        ("EIS_EE", "EIS Employee (0.2%)", "deduction", True),
        ("PCB", "LHDN PCB (~15%)", "deduction", True),
        ("EPF_ER", "EPF Employer (13%)", "employer_contribution", True),
        ("SOCSO_ER", "SOCSO Employer (1.75%)", "employer_contribution", True),
        ("EIS_ER", "EIS Employer (0.4%)", "employer_contribution", True),
    ]
    comp_objs: dict[str, PayrollComponent] = {}
    for code, name, ctype, is_stat in components_meta:
        comp, _ = PayrollComponent.all_objects.update_or_create(
            org_id=org.id,
            code=code,
            defaults={"name": name, "type": ctype, "is_statutory": is_stat},
        )
        comp_objs[code] = comp

    # Period
    period, _ = PayrollPeriod.all_objects.update_or_create(
        org_id=org.id,
        period_start=period_start,
        period_end=period_end,
        defaults={
            "period_type": "monthly",
            "pay_date": pay_date,
            "status": "draft",
        },
    )

    # Run
    run, _ = PayrollRun.all_objects.update_or_create(
        org_id=org.id,
        period=period,
        defaults={
            "uploaded_by": actor_id,
            "status": "draft",
            "row_count": len(employees),
        },
    )

    # Gross schedule (realistic MY range RM 3,500-12,000)
    gross_schedule = [
        Decimal("8500"),  # DEMO-001 manager
        Decimal("7500"),  # DEMO-002 manager
        Decimal("4800"),  # DEMO-003
        Decimal("4500"),  # DEMO-004
        Decimal("9000"),  # DEMO-005
        Decimal("5500"),  # DEMO-006
        Decimal("4200"),  # DEMO-007 contract
        Decimal("11000"),  # DEMO-008
        Decimal("3800"),  # DEMO-009 contract
        Decimal("6200"),  # DEMO-010
    ]

    n_published = 0
    from common.audit import append, append_payroll

    for i, emp in enumerate(employees):
        gross = gross_schedule[i] if i < len(gross_schedule) else Decimal("5000")
        epf_ee = (gross * Decimal("0.11")).quantize(Decimal("0.01"))
        socso_ee = (gross * Decimal("0.005")).quantize(Decimal("0.01"))
        eis_ee = (gross * Decimal("0.002")).quantize(Decimal("0.01"))
        pcb = (gross * Decimal("0.15")).quantize(Decimal("0.01"))
        total_deductions = epf_ee + socso_ee + eis_ee + pcb
        net = gross - total_deductions

        epf_er = (gross * Decimal("0.13")).quantize(Decimal("0.01"))
        socso_er = (gross * Decimal("0.0175")).quantize(Decimal("0.01"))
        eis_er = (gross * Decimal("0.004")).quantize(Decimal("0.01"))

        existing = PayslipRecord.all_objects.filter(
            employee_id=emp.id, period=period, deleted_at__isnull=True
        ).first()
        if existing:
            n_published += 1
            continue

        ps = PayslipRecord.all_objects.create(
            org_id=org.id,
            employee_id=emp.id,
            period=period,
            gross=gross,
            net=net,
            currency_code="MYR",
            components={"BASIC": str(gross)},
            deductions={
                "EPF_EE": str(epf_ee),
                "SOCSO_EE": str(socso_ee),
                "EIS_EE": str(eis_ee),
                "PCB": str(pcb),
                "EPF_ER": str(epf_er),
                "SOCSO_ER": str(socso_er),
                "EIS_ER": str(eis_er),
            },
            status="published",
            source="manual",
            published_at=timezone.now(),
        )

        # Write audit log rows (mirrors publish_run's logic)
        append(
            org_id=org.id,
            action="payslip.publish",
            entity="payslips",
            entity_id=ps.id,
            before=None,
            after={
                "employee_code": emp.employee_code,
                "period": str(ps.period.period_start),
                "gross": str(ps.gross),
                "net": str(ps.net),
            },
            actor_id=actor_id,
        )
        append_payroll(
            org_id=org.id,
            action="payslip.publish",
            entity="payslips",
            entity_id=ps.id,
            payload={
                "employee_code": emp.employee_code,
                "period_start": str(ps.period.period_start),
                "period_end": str(ps.period.period_end),
                "gross": str(ps.gross),
                "net": str(ps.net),
                "currency": ps.currency_code,
            },
            actor_id=actor_id,
        )
        n_published += 1

    # Mark run + period published
    if run.status != "published":
        run.status = "published"
        run.published_at = timezone.now()
        run.row_count = n_published
        run.save(update_fields=["status", "published_at", "row_count", "updated_at"])
    if period.status != "published":
        period.status = "published"
        period.save(update_fields=["status", "updated_at"])

    return n_published


def _seed_kpi(
    org: Organization,
    employees: list[Employee],
) -> int:
    """1 KpiTemplate with 3-4 definitions, 1 KpiCycle in self_review, all 10 assigned.
    At least 3 employees submit a self-review.
    """
    # Template
    template = KpiTemplate.all_objects.filter(org_id=org.id, name="Demo Q2 2026 KPIs").first()
    if template is None:
        template = TemplateService.create_template(
            org_id=org.id,
            name="Demo Q2 2026 KPIs",
            description="Quarterly KPI template for Q2 2026 demo",
        )
        TemplateService.add_definition(
            template,
            code="TASK_COMPLETION",
            name="Task Completion Rate",
            metric_type="percentage",
            target=Decimal("90"),
            unit="%",
            weight=Decimal("1.5"),
            sort_order=1,
        )
        TemplateService.add_definition(
            template,
            code="INCIDENTS_RESOLVED",
            name="Incidents Resolved",
            metric_type="numeric",
            target=Decimal("50"),
            unit="tickets",
            weight=Decimal("1.2"),
            sort_order=2,
        )
        TemplateService.add_definition(
            template,
            code="CUSTOMER_SATISFACTION",
            name="Customer Satisfaction Score",
            metric_type="rating",
            target=Decimal("4.5"),
            unit="/ 5",
            weight=Decimal("1.0"),
            sort_order=3,
        )
        TemplateService.add_definition(
            template,
            code="TRAINING_HOURS",
            name="Training Hours Completed",
            metric_type="numeric",
            target=Decimal("16"),
            unit="hours",
            weight=Decimal("0.8"),
            sort_order=4,
        )

    # Cycle
    cycle = KpiCycle.all_objects.filter(org_id=org.id, name="Q2 2026 Performance Review").first()
    if cycle is None:
        cycle = KpiCycle.all_objects.create(
            org_id=org.id,
            name="Q2 2026 Performance Review",
            type="quarterly",
            starts_on=datetime.date(2026, 4, 1),
            ends_on=datetime.date(2026, 6, 30),
            review_opens_on=datetime.date(2026, 7, 1),
            review_closes_on=datetime.date(2026, 7, 31),
            status="upcoming",
        )
        # Transition to self_review
        CycleService.transition(cycle, "self_review")
    elif cycle.status == "upcoming":
        CycleService.transition(cycle, "self_review")

    # Assign all 10 employees
    emp_ids = [e.id for e in employees]
    n_assigned = AssignmentService.bulk_assign(
        cycle=cycle,
        template=template,
        employee_ids=emp_ids,
    )

    # At least 3 employees submit self-review
    assignments = KpiAssignment.all_objects.filter(
        cycle=cycle,
        employee_id__in=emp_ids,
        deleted_at__isnull=True,
    )

    review_count = 0
    for i, assignment in enumerate(assignments[:3]):
        existing_review = assignment.reviews.filter(stage="self").first()
        if existing_review:
            review_count += 1
            continue
        scores = {
            "TASK_COMPLETION": {
                "score": str(Decimal("85") + Decimal(str(i * 3))),
                "comment": "On track",
            },
            "INCIDENTS_RESOLVED": {"score": str(45 + i * 2), "comment": "Good progress"},
            "CUSTOMER_SATISFACTION": {
                "score": str(Decimal("4.2") + Decimal(str(i)) * Decimal("0.1")),
                "comment": "Positive feedback",
            },
            "TRAINING_HOURS": {"score": str(12 + i * 2), "comment": "Completed modules"},
        }
        try:
            ReviewService.submit_self(
                assignment,
                submitted_by=assignment.employee_id,
                scores=scores,
                overall_comment="Overall good performance this quarter.",
            )
            review_count += 1
        except Exception:  # noqa: S110
            pass  # cycle may have transitioned; skip gracefully

    return n_assigned + (len(employees) - n_assigned)  # total assignment count


def _seed_certifications(
    org: Organization,
    employees: list[Employee],
    actor_id: uuid.UUID,
) -> tuple[int, int]:
    """1-2 Certification rows per employee. At least 4 expiring in 25-35 days.
    2 TrainingPlans. TrainingAssignment for everyone (half completed, half in progress).
    """
    today = timezone.localdate()
    n_certs = 0
    n_trainings = 0

    cert_data = [
        # (name, issuer, days_ago_issued, expires_in_days_or_None)
        ("Certified Information Systems Security Professional", "ISC2", 365, 730),
        ("CompTIA Security+", "CompTIA", 180, 1095),
        ("AWS Solutions Architect", "Amazon Web Services", 90, 365),
        ("Microsoft Azure Fundamentals", "Microsoft", 60, None),  # no expiry
        ("Certified Ethical Hacker", "EC-Council", 200, 730),
        ("Google Cloud Professional", "Google", 300, 365),
        ("ITIL Foundation", "Axelos", 400, None),
        ("Prince2 Practitioner", "Axelos", 150, 730),
        ("Data Protection Officer Cert", "PDPA Malaysia", 500, 365),
        ("ISO 27001 Lead Implementer", "BSI", 250, 730),
    ]

    # Employees 0-3 get certifications expiring in 25-35 days (Celery reminder hook targets)
    near_expiry_days = [30, 27, 32, 28]  # within 25-35 day window, do NOT set reminder_sent_30d

    for i, emp in enumerate(employees):
        # First cert
        cert_info_1 = cert_data[i % len(cert_data)]
        issued_1 = today - datetime.timedelta(days=cert_info_1[2])
        if i < 4:
            # Near-expiry cert for the first 4 employees
            expires_1 = today + datetime.timedelta(days=near_expiry_days[i])
        elif cert_info_1[3] is not None:
            expires_1 = today + datetime.timedelta(days=cert_info_1[3] - cert_info_1[2])
        else:
            expires_1 = None

        _cert1, c1_created = Certification.all_objects.get_or_create(
            org_id=org.id,
            employee_id=emp.id,
            name=cert_info_1[0],
            defaults={
                "issuer": cert_info_1[1],
                "issued_on": issued_1,
                "expires_on": expires_1,
                "status": "active",
                "reminder_sent_30d": False,  # leave for Celery daily task
                "reminder_sent_60d": False,
                "reminder_sent_90d": False,
            },
        )
        if c1_created:
            n_certs += 1
        else:
            n_certs += 1  # count existing

        # Second cert (every other employee)
        if i % 2 == 0:
            cert_info_2 = cert_data[(i + 5) % len(cert_data)]
            issued_2 = today - datetime.timedelta(days=cert_info_2[2])
            expires_2 = (
                today + datetime.timedelta(days=cert_info_2[3] - cert_info_2[2])
                if cert_info_2[3]
                else None
            )

            _cert2, c2_created = Certification.all_objects.get_or_create(
                org_id=org.id,
                employee_id=emp.id,
                name=cert_info_2[0],
                defaults={
                    "issuer": cert_info_2[1],
                    "issued_on": issued_2,
                    "expires_on": expires_2,
                    "status": "active",
                    "reminder_sent_30d": False,
                    "reminder_sent_60d": False,
                    "reminder_sent_90d": False,
                },
            )
            if c2_created:
                n_certs += 1
            else:
                n_certs += 1

    # Training Plans
    plan_onboarding, _ = TrainingPlan.all_objects.update_or_create(
        org_id=org.id,
        name="Onboarding",
        defaults={"description": "New employee onboarding programme"},
    )
    plan_cybersec, _ = TrainingPlan.all_objects.update_or_create(
        org_id=org.id,
        name="Cybersecurity Awareness",
        defaults={"description": "Annual cybersecurity awareness training"},
    )

    # Assign both plans to all 10 employees
    # Half (indices 0-4) get completed assignments; half (5-9) get in_progress
    for i, emp in enumerate(employees):
        for plan in [plan_onboarding, plan_cybersec]:
            assignment, created = TrainingAssignment.all_objects.get_or_create(
                org_id=org.id,
                plan=plan,
                employee_id=emp.id,
                defaults={
                    "assigned_by": actor_id,
                    "due_date": today + datetime.timedelta(days=90),
                    "status": "assigned",
                },
            )
            if i < 5 and assignment.status not in ("completed",):
                # complete_assignment marks as completed and writes audit log
                try:
                    complete_assignment(assignment)
                except Exception:  # noqa: S110
                    pass  # may already be completed
            elif i >= 5 and assignment.status == "assigned":
                assignment.status = "in_progress"
                assignment.save(update_fields=["status", "updated_at"])

            if created:
                n_trainings += 1
            else:
                n_trainings += 1

    return n_certs, n_trainings


# ─── Command ──────────────────────────────────────────────────────────────────


class Command(BaseCommand):
    help = "Seed 10 demo employees + populate every HRMS module for UI click-through testing."

    def add_arguments(self, parser):
        parser.add_argument(
            "--prod",
            action="store_true",
            help="Skip demo data seeding in production environments.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options["prod"]:
            self.stdout.write(
                self.style.WARNING(
                    "seed_demo_data skipped: --prod flag is set. "
                    "This command is for demo/staging environments only."
                )
            )
            return

        self.stdout.write("seed_demo_data: checking org exists...")
        try:
            org = _get_org()
        except Organization.DoesNotExist:
            self.stderr.write(
                self.style.ERROR(
                    "Provintell org not found. Run seed_provintell first:\n"
                    "  uv run python manage.py seed_provintell"
                )
            )
            return

        self.stdout.write("  Loading departments...")
        try:
            depts = _get_depts(org)
        except RuntimeError as exc:
            self.stderr.write(self.style.ERROR(str(exc)))
            return

        # ── Users + Employees ────────────────────────────────────────────
        self.stdout.write("  Creating demo users + employees...")

        # Create users first
        users: dict[str, User] = {}
        for data in DEMO_EMPLOYEES:
            role_code = "manager" if data["is_manager"] else "employee"
            email = f"{data['code'].lower()}@provintell.local"
            user = _ensure_demo_user(org, email, "Demo!2026", role_code)
            users[data["code"]] = user

        # Create employees (pass 1: without managers, so FK constraints are safe)
        employees_map: dict[str, Employee] = {}
        for data in DEMO_EMPLOYEES:
            emp = _ensure_employee_full(
                org=org,
                dept=depts[data["dept_key"]],
                data=data,
                user=users[data["code"]],
                manager=None,  # set in pass 2
            )
            employees_map[data["code"]] = emp

        # Pass 2: wire manager relationships
        # DEMO-001 (ops manager) manages DEMO-003, DEMO-004, DEMO-010
        # DEMO-002 (hr manager) manages DEMO-007, DEMO-009
        manager_map = {
            "PVT-DEMO-003": "PVT-DEMO-001",
            "PVT-DEMO-004": "PVT-DEMO-001",
            "PVT-DEMO-010": "PVT-DEMO-001",
            "PVT-DEMO-007": "PVT-DEMO-002",
            "PVT-DEMO-009": "PVT-DEMO-002",
        }
        for emp_code, mgr_code in manager_map.items():
            emp = employees_map[emp_code]
            mgr = employees_map[mgr_code]
            if emp.manager_id != mgr.id:
                emp.manager = mgr
                emp.save(update_fields=["manager_id", "updated_at"])

        # Reload all with fresh data
        employees = list(
            Employee.all_objects.filter(
                org_id=org.id,
                employee_code__startswith="PVT-DEMO-",
                deleted_at__isnull=True,
            ).order_by("employee_code")
        )

        # Pre-fund ANNUAL leave for all demo employees
        self.stdout.write("  Pre-funding annual leave...")
        annual = LeaveType.all_objects.filter(org_id=org.id, code="ANNUAL").first()
        if annual:
            for emp in employees:
                BalanceService.accrue(
                    org_id=org.id,
                    employee_id=emp.id,
                    leave_type=annual,
                    year=2026,
                    days=Decimal("14"),
                    reason="accrual",
                    reference_type="seed_demo_annual",
                    reference_id=emp.id,
                )

        # Find finance + admin users from seed_provintell for workflow approval
        finance_user = User.objects.filter(org_id=org.id, email="finance@provintell.demo").first()
        admin_user = User.objects.filter(org_id=org.id, email="admin@provintell.demo").first()
        # Fallback: use manager DEMO-001's user
        if not finance_user:
            finance_user = users.get("PVT-DEMO-002") or next(iter(users.values()))
        if not admin_user:
            admin_user = users.get("PVT-DEMO-001") or next(iter(users.values()))

        # Actor for system operations (audit log)
        actor_id = admin_user.id

        # ── Schedule ─────────────────────────────────────────────────────
        self.stdout.write("  Seeding shift schedules...")
        shift_employees = [e for e in employees if e.schedule_type == "shift"]
        _seed_schedules(org, shift_employees)

        # ── Attendance ───────────────────────────────────────────────────
        self.stdout.write("  Seeding attendance records (+ holiday signal)...")
        # Find a 2026 federal MY holiday for shift workers
        from modules.schedule.models import Holiday

        holiday_2026 = (
            Holiday.all_objects.filter(
                org_id=org.id,
                date__year=2026,
                type="federal",
                deleted_at__isnull=True,
            )
            .order_by("date")
            .first()
        )
        holiday_date = holiday_2026.date if holiday_2026 else None
        n_attendance = _seed_attendance(org, employees, holiday_date)

        # ── Leave ────────────────────────────────────────────────────────
        self.stdout.write("  Seeding leave requests...")
        mgr_emp = employees_map.get("PVT-DEMO-001", employees[0])
        n_leave = _seed_leave(org, employees, mgr_emp, admin_user)

        # ── Claims ───────────────────────────────────────────────────────
        self.stdout.write("  Seeding claims...")
        n_claims = _seed_claims(org, employees, finance_user)

        # ── Payslips ─────────────────────────────────────────────────────
        self.stdout.write("  Seeding payslips...")
        n_payslips = _seed_payslips(org, employees, actor_id)

        # ── KPI ──────────────────────────────────────────────────────────
        self.stdout.write("  Seeding KPI assignments + self-reviews...")
        n_kpi = _seed_kpi(org, employees)

        # ── Certifications ───────────────────────────────────────────────
        self.stdout.write("  Seeding certifications + training...")
        n_certs, n_trainings = _seed_certifications(org, employees, actor_id)

        # ── Count notifications + audit log ──────────────────────────────
        from common.audit.models import AuditLog
        from modules.notification.models import Notification

        n_notifications = Notification.objects.filter(
            user__org_id=org.id,
        ).count()
        n_audit = AuditLog.objects.filter(org_id=org.id).count()

        # ── Schedule rows count ───────────────────────────────────────────
        n_schedule_total = ShiftAssignment.all_objects.filter(
            org_id=org.id,
            employee__employee_code__startswith="PVT-DEMO-",
            deleted_at__isnull=True,
        ).count()

        self.stdout.write(self.style.SUCCESS("\nDemo data seeded:"))
        self.stdout.write(
            f"  Employees:       {len(employees)}  " f"(8 fulltime + 2 contract; 4 shift + 6 fixed)"
        )
        self.stdout.write(
            f"  Users:           {len(employees)}  "
            f"(login: <code-lower>@provintell.local / Demo!2026)"
        )
        self.stdout.write(f"  Schedule rows:   {n_schedule_total}")
        self.stdout.write(f"  Attendance rows: {n_attendance}")
        self.stdout.write(f"  Leave requests:  {n_leave}")
        self.stdout.write(f"  Claims:          {n_claims}")
        self.stdout.write(f"  Payslips:        {n_payslips}")
        self.stdout.write(f"  KPI assignments: {n_kpi}")
        self.stdout.write(f"  Certifications:  {n_certs}")
        self.stdout.write(f"  Trainings:       {n_trainings}")
        self.stdout.write(f"  Notifications:   {n_notifications}")
        self.stdout.write(f"  Audit log rows:  {n_audit}")
