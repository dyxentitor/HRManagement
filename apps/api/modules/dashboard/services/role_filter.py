"""Per-dashboard-variant card list (command-center redesign, v1.12.0).

Cards self-hide when the user lacks their required permissions
(Card.is_visible_for), so a variant can list a card generously without leaking
data. Layer order here matches the frontend's 5-layer composition.
"""

from __future__ import annotations

DASHBOARD_CARDS: dict[str, list[str]] = {
    "me": [
        "hero_summary",
        "pending_tasks",
        "my_leave_balance",
        "recent_claims_self",
        "activity_feed",
        "company_announcements",
        "upcoming_holidays",
        "birthdays_this_month",
    ],
    "team": [
        "hero_summary",
        "pending_tasks",
        "employee_snapshot",
        "payroll_status",
        "activity_feed",
        "company_announcements",
        "upcoming_holidays",
        "birthdays_this_month",
        "smart_insights",
    ],
    "admin": [
        "hero_summary",
        "pending_tasks",
        "employee_snapshot",
        "payroll_status",
        "activity_feed",
        "company_announcements",
        "upcoming_holidays",
        "birthdays_this_month",
        "smart_insights",
    ],
}
