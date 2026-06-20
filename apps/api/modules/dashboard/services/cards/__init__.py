"""Card registry — import each card type."""

from __future__ import annotations

from .activity_feed import ActivityFeed
from .attendance_summary import AttendanceSummary
from .base import Card
from .birthdays_this_month import BirthdaysThisMonth
from .certs_expiring_team import CertsExpiringTeam
from .company_announcements import CompanyAnnouncements
from .department_overview import DepartmentOverview
from .employee_snapshot import EmployeeSnapshot
from .hero_summary import HeroSummary
from .kpi_cycle_progress_team import KpiCycleProgressTeam
from .my_leave_balance import MyLeaveBalance
from .payroll_status import PayrollStatus
from .pending_approvals import PendingApprovals
from .pending_tasks import PendingTasks
from .recent_claims_self import RecentClaimsSelf
from .today_attendance_team import TodayAttendanceTeam
from .upcoming_holidays import UpcomingHolidays

CARD_TYPES: dict[str, type[Card]] = {
    cls.type: cls
    for cls in (
        PendingApprovals,
        MyLeaveBalance,
        UpcomingHolidays,
        CertsExpiringTeam,
        KpiCycleProgressTeam,
        TodayAttendanceTeam,
        RecentClaimsSelf,
        BirthdaysThisMonth,
        # v1.12.0 — operational dashboard cards
        HeroSummary,
        PendingTasks,
        EmployeeSnapshot,
        AttendanceSummary,
        PayrollStatus,
        ActivityFeed,
        DepartmentOverview,
        CompanyAnnouncements,
    )
}

__all__ = [
    "CARD_TYPES",
    "ActivityFeed",
    "AttendanceSummary",
    "BirthdaysThisMonth",
    "Card",
    "CertsExpiringTeam",
    "CompanyAnnouncements",
    "DepartmentOverview",
    "EmployeeSnapshot",
    "HeroSummary",
    "KpiCycleProgressTeam",
    "MyLeaveBalance",
    "PayrollStatus",
    "PendingApprovals",
    "PendingTasks",
    "RecentClaimsSelf",
    "TodayAttendanceTeam",
    "UpcomingHolidays",
]
