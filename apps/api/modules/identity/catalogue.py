"""Permission catalogue — turns the flat code list into a grouped, described, scannable structure.

Grouping is DERIVED from the ``<module>:`` code prefix via the ``MODULES`` taxonomy below (no
group/module DB tables). Per-permission human metadata (label/description/requires/dangerous) lives
on the Permission rows, loaded from the YAML fixtures. Scope is parsed from the code, never stored.
"""

from __future__ import annotations

from typing import Any

from .models import Permission, Role

# Ordered product-area taxonomy mapping code prefixes to display groups; this is where split domains
# are merged (payslip+payroll, cert+training, user+employee). Presentation config in code.
# A prefix not listed here falls into the synthetic "other" group at the end.
MODULES: list[dict[str, Any]] = [
    {
        "key": "dashboard",
        "label": "Dashboard",
        "icon": "LayoutDashboard",
        "prefixes": ["dashboard"],
    },
    {
        "key": "people",
        "label": "People",
        "icon": "Users",
        "prefixes": ["employee", "user", "department", "team"],
    },
    {"key": "leave", "label": "Leave", "icon": "Palmtree", "prefixes": ["leave"]},
    {
        "key": "schedule",
        "label": "Schedule & Attendance",
        "icon": "CalendarClock",
        "prefixes": ["schedule", "attendance"],
    },
    {"key": "claims", "label": "Claims", "icon": "Receipt", "prefixes": ["claim"]},
    {"key": "payroll", "label": "Payroll", "icon": "Wallet", "prefixes": ["payslip", "payroll"]},
    {"key": "kpi", "label": "Performance (KPI)", "icon": "Target", "prefixes": ["kpi"]},
    {
        "key": "learning",
        "label": "Certifications & Training",
        "icon": "GraduationCap",
        "prefixes": ["cert", "training"],
    },
    {
        "key": "incentive",
        "label": "Incentive (Mandays)",
        "icon": "Coins",
        "prefixes": ["incentive"],
    },
    {
        "key": "actioncenter",
        "label": "Action Center",
        "icon": "ListChecks",
        "prefixes": ["assignment", "announcement", "onboarding"],
    },
    {"key": "feedback", "label": "Feedback", "icon": "MessageSquare", "prefixes": ["feedback"]},
    {"key": "approvals", "label": "Approvals", "icon": "ClipboardCheck", "prefixes": ["approvals"]},
    {"key": "reports", "label": "Reports", "icon": "FileSpreadsheet", "prefixes": ["report"]},
    {
        "key": "notifications",
        "label": "Notifications",
        "icon": "Bell",
        "prefixes": ["notification"],
    },
    {
        "key": "admin",
        "label": "Administration",
        "icon": "Settings",
        "prefixes": ["role", "permission", "org", "audit", "identity", "auth"],
    },
]

_SCOPE_MAP = {"self": "self", "team": "team", "org": "org", "me": "self"}

# Curated sensitivity defaults — a fixture's `dangerous: true` still wins, but these guarantee the
# obviously-privileged permissions are flagged (PII, money, admin) so the UI warns on grant.
_DANGEROUS_SUBSTRINGS = (
    "salary",
    "bank",
    "payroll",
    "payslip",
    "role:write",
    "permission:",
    "org:feature_flag:write",
    "email_config",
    "user:delete",
    "user:disable",
    "audit",
    "identity:",
)


def is_dangerous_code(code: str) -> bool:
    return any(s in code for s in _DANGEROUS_SUBSTRINGS)


def _module_for(code: str) -> dict[str, Any] | None:
    prefix = code.split(":", 1)[0]
    for m in MODULES:
        if prefix in m["prefixes"]:
            return m
    return None


def scope_of(code: str) -> str | None:
    """Parse a normalized data-scope from the code's last segment, or None if it isn't a scope."""
    tail = code.rsplit(":", 1)[-1]
    return _SCOPE_MAP.get(tail)


def humanize(code: str) -> str:
    """Fallback label from a code, e.g. 'employee:read:org' -> 'Employee Read'.

    Drops a trailing scope segment so the scope pill (rendered separately) isn't duplicated.
    """
    parts = code.split(":")
    if len(parts) > 1 and scope_of(code) is not None:
        parts = parts[:-1]
    return " ".join(w.replace("_", " ").replace("-", " ").title() for w in parts) or code


def _permission_dto(p: Permission, granted_codes: set[str] | None) -> dict[str, Any]:
    dto: dict[str, Any] = {
        "code": p.code,
        "label": p.label or humanize(p.code),
        "description": p.description,
        "scope": scope_of(p.code),
        "requires": p.requires or [],
        "dangerous": p.is_dangerous or is_dangerous_code(p.code),
    }
    if granted_codes is not None:
        dto["granted"] = p.code in granted_codes
    return dto


def build_catalogue(role: Role | None = None) -> list[dict[str, Any]]:
    """Group permissions into ordered modules; with ``role``, each permission gets ``granted``."""
    granted_codes = (
        set(role.permissions.values_list("code", flat=True)) if role is not None else None
    )
    order = {m["key"]: i for i, m in enumerate(MODULES)}
    buckets: dict[str, dict[str, Any]] = {}

    for p in Permission.objects.all().order_by("code"):
        m = _module_for(p.code)
        key = m["key"] if m else "other"
        if key not in buckets:
            buckets[key] = {
                "key": key,
                "label": m["label"] if m else "Other",
                "icon": m["icon"] if m else "Shapes",
                "permissions": [],
            }
        buckets[key]["permissions"].append(_permission_dto(p, granted_codes))

    modules = sorted(buckets.values(), key=lambda b: order.get(b["key"], len(order)))
    for b in modules:
        b["granted_count"] = sum(1 for x in b["permissions"] if x.get("granted")) if role else 0
        b["total"] = len(b["permissions"])
    return modules


def build_effective(sources: dict[str, list[str]]) -> list[dict[str, Any]]:
    """Group a user's *granted* permissions into modules, each annotated with its source role(s).

    ``sources`` maps a permission code to the list of the user's role codes that grant it.
    """
    order = {m["key"]: i for i, m in enumerate(MODULES)}
    buckets: dict[str, dict[str, Any]] = {}
    for p in Permission.objects.filter(code__in=list(sources)).order_by("code"):
        m = _module_for(p.code)
        key = m["key"] if m else "other"
        if key not in buckets:
            buckets[key] = {
                "key": key,
                "label": m["label"] if m else "Other",
                "icon": m["icon"] if m else "Shapes",
                "permissions": [],
            }
        buckets[key]["permissions"].append(
            {
                "code": p.code,
                "label": p.label or humanize(p.code),
                "scope": scope_of(p.code),
                "dangerous": p.is_dangerous or is_dangerous_code(p.code),
                "sources": sorted(set(sources.get(p.code, []))),
            }
        )
    modules = sorted(buckets.values(), key=lambda b: order.get(b["key"], len(order)))
    for b in modules:
        b["total"] = len(b["permissions"])
    return modules
