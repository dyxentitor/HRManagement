"""Card registry — import each card type."""

from __future__ import annotations

from .base import Card
from .birthdays_this_month import BirthdaysThisMonth
from .certs_expiring_team import CertsExpiringTeam
from .kpi_cycle_progress_team import KpiCycleProgressTeam
from .my_leave_balance import MyLeaveBalance
from .pending_approvals import PendingApprovals
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
    )
}

__all__ = [
    "Card",
    "CARD_TYPES",
    "PendingApprovals",
    "MyLeaveBalance",
    "UpcomingHolidays",
    "CertsExpiringTeam",
    "KpiCycleProgressTeam",
    "TodayAttendanceTeam",
    "RecentClaimsSelf",
    "BirthdaysThisMonth",
]
