"""Per-dashboard-variant card list."""

from __future__ import annotations

# Cards per dashboard variant (in display order)
DASHBOARD_CARDS: dict[str, list[str]] = {
    "me": [
        "my_leave_balance",
        "upcoming_holidays",
        "recent_claims_self",
        "birthdays_this_month",
    ],
    "team": [
        "pending_approvals",
        "today_attendance_team",
        "certs_expiring_team",
        "kpi_cycle_progress_team",
        "my_leave_balance",
        "upcoming_holidays",
    ],
    "admin": [
        "pending_approvals",
        "today_attendance_team",
        "certs_expiring_team",
        "kpi_cycle_progress_team",
        "birthdays_this_month",
        "upcoming_holidays",
    ],
}
