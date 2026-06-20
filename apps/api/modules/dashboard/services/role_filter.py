"""Per-dashboard-variant card list."""

from __future__ import annotations

# Cards per dashboard variant (in display order). Cards self-hide when the user
# lacks their required permissions (Card.is_visible_for), so a variant can list a
# card generously without leaking data.
DASHBOARD_CARDS: dict[str, list[str]] = {
    "me": [
        "hero_summary",
        "pending_tasks",
        "my_leave_balance",
        "recent_claims_self",
        "company_announcements",
        "upcoming_holidays",
        "birthdays_this_month",
        "activity_feed",
    ],
    "team": [
        "hero_summary",
        "pending_tasks",
        "attendance_summary",
        "today_attendance_team",
        "certs_expiring_team",
        "kpi_cycle_progress_team",
        "company_announcements",
        "upcoming_holidays",
        "birthdays_this_month",
        "activity_feed",
        "my_leave_balance",
    ],
    "admin": [
        "hero_summary",
        "pending_tasks",
        "employee_snapshot",
        "attendance_summary",
        "payroll_status",
        "department_overview",
        "company_announcements",
        "upcoming_holidays",
        "birthdays_this_month",
        "activity_feed",
    ],
}
