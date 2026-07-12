"""Single source of truth for what's a togglable module.

Used by both the backend (services, decorator) and frontend (via the
GET /api/v1/org/feature-flags/ endpoint which returns this list joined
with the FeatureFlag rows).
"""

from __future__ import annotations

# 10 admin-togglable modules with optional dependencies.
# `depends_on` means: if any dep is disabled, this module's effective
# state is disabled too (cascade).
TOGGLABLE_MODULES: dict[str, dict] = {
    "leave": {"label": "Leave", "depends_on": []},
    "schedule": {"label": "Schedule", "depends_on": []},
    "attendance": {"label": "Attendance", "depends_on": ["schedule"]},
    "claims": {"label": "Claims", "depends_on": []},
    "payslip": {"label": "Payslips", "depends_on": []},
    "kpi": {"label": "KPI", "depends_on": []},
    "certification": {"label": "Certifications", "depends_on": []},
    "training": {"label": "Training", "depends_on": ["certification"]},
    "reports": {"label": "Reports", "depends_on": []},
    "notifications": {"label": "Notifications", "depends_on": []},
    "incentive": {"label": "Incentive (Mandays)", "depends_on": []},
    "announcements": {"label": "Announcements", "depends_on": []},
    "feedback": {"label": "Feedback", "depends_on": []},
}

# Always-on. Disabling = system lockout. is_enabled() short-circuits
# to True for these regardless of DB state.
CRITICAL_MODULES: set[str] = {"identity", "employee", "organization"}

# Derived (informational). Effective state is computed from any of the
# referenced togglable modules being enabled.
DERIVED_MODULES: dict[str, dict] = {
    "dashboard": {
        "label": "Dashboard",
        "depends_on_any": ["leave", "schedule", "attendance", "claims", "kpi", "certification"],
    },
    "approvals": {
        "label": "Approvals",
        "depends_on_any": ["leave", "claims", "kpi"],
    },
}
