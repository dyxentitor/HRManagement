"""Per-notification email card enrichment. Best-effort: failures → generic card."""

from __future__ import annotations

import datetime
import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Callable

from django.conf import settings

from modules.notification.labels import label_for
from modules.notification.models import Notification

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CardContext:
    greeting_name: str
    headline: str
    rows: list[tuple[str, str]] = field(default_factory=list)
    cta_label: str = "View in HRMS"
    cta_url: str = ""
    whats_next: str = ""

    def as_context(self) -> dict:
        return {
            "greeting_name": self.greeting_name,
            "headline": self.headline,
            "rows": [{"label": k, "value": v} for k, v in self.rows],
            "cta_label": self.cta_label,
            "cta_url": self.cta_url,
            "whats_next": self.whats_next,
        }


def _abs(deep_link: str) -> str:
    base = (getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
    return f"{base}{deep_link}" if deep_link else base


def _greeting_name(n: Notification) -> str:
    try:
        from modules.employee.models import Employee

        emp = Employee.all_objects.filter(user_id=n.user_id).first()
        if emp and emp.first_name:
            return emp.first_name
    except Exception:
        pass
    return "there"


def _fmt_date(d) -> str:
    if not isinstance(d, datetime.date):
        return str(d or "")
    return f"{d.day} {d:%b %Y}"


def _fmt_range(a, b) -> str:
    if not (isinstance(a, datetime.date) and isinstance(b, datetime.date)):
        return _fmt_date(a) or _fmt_date(b)
    if a == b:
        return _fmt_date(a)
    if (a.month, a.year) == (b.month, b.year):
        return f"{a.day}–{b.day} {b:%b %Y}"
    if a.year == b.year:
        return f"{a.day} {a:%b} – {b.day} {b:%b %Y}"
    return f"{_fmt_date(a)} – {_fmt_date(b)}"


def _fmt_money(amount, cur: str = "MYR") -> str:
    try:
        return f"{cur} {Decimal(str(amount)):,.2f}"
    except Exception:
        return f"{cur} {amount}"


def _generic_card(n: Notification) -> CardContext:
    rows: list[tuple[str, str]] = []
    for k, v in (n.payload or {}).items():
        if isinstance(v, str) and v.strip() and not k.endswith("_id"):
            rows.append((k.replace("_", " ").title(), v))
    return CardContext(
        greeting_name=_greeting_name(n),
        headline=label_for(n.type),
        rows=rows[:5],
        cta_url=_abs(n.deep_link),
    )


def _leave_card(n: Notification) -> CardContext:
    from modules.leave.models import LeaveApproval, LeaveBalance, LeaveRequest

    name = _greeting_name(n)
    p = n.payload or {}

    # replacement_granted carries no leave_request_id — build from payload only
    if n.type == "leave.replacement_granted":
        return CardContext(
            greeting_name=name,
            headline=f"You've been granted {p.get('days', '')} replacement day(s) \U0001f334",
            rows=[
                ("Type", str(p.get("leave_type", ""))),
                ("Days", str(p.get("days", ""))),
                ("Year", str(p.get("year", ""))),
            ],
            cta_url=_abs(n.deep_link),
        )

    lr = (
        LeaveRequest.all_objects.select_related("leave_type")
        .filter(id=p.get("leave_request_id"))
        .first()
    )
    if lr is None:
        return _generic_card(n)

    dates = _fmt_range(lr.start_date, lr.end_date)
    days = str(lr.total_days).rstrip("0").rstrip(".")
    base_rows: list[tuple[str, str]] = [
        ("Type", lr.leave_type.name),
        ("Dates", dates),
        ("Days", days),
    ]

    if n.type == "leave.submitted":
        # Recipient is the approver; headline names the requesting employee
        from modules.employee.models import Employee

        emp = Employee.all_objects.filter(id=lr.employee_id).first()
        who = f"{emp.first_name} {emp.last_name}".strip() if emp else str(lr.employee_id)
        return CardContext(
            greeting_name=name,
            headline=f"{who} submitted a leave request for your approval",
            rows=[("Employee", who), *base_rows],
            cta_label="Review request",
            cta_url=_abs("/leave/approvals"),
        )

    if n.type == "leave.approved":
        bal = (
            LeaveBalance.all_objects.filter(
                employee_id=lr.employee_id,
                leave_type=lr.leave_type,
                year=lr.start_date.year,
            ).first()
        )
        rows = list(base_rows)
        if bal is not None:
            rows.append(("Balance left", f"{bal.available} days"))
        return CardContext(
            greeting_name=name,
            headline="Your leave request has been approved ✅",
            rows=rows,
            cta_url=_abs(n.deep_link),
            whats_next="A calendar hold will be added automatically.",
        )

    if n.type == "leave.rejected":
        appr = (
            LeaveApproval.objects.filter(leave_request=lr, status="rejected")
            .order_by("-acted_at")
            .first()
        )
        rows = list(base_rows)
        if appr and appr.comment:
            rows.append(("Reason", appr.comment))
        return CardContext(
            greeting_name=name,
            headline="Your leave request wasn't approved",
            rows=rows,
            cta_url=_abs(n.deep_link),
            whats_next="You can amend and resubmit.",
        )

    if n.type == "leave.cancelled":
        return CardContext(
            greeting_name=name,
            headline="Your leave request was cancelled",
            rows=base_rows,
            cta_url=_abs(n.deep_link),
        )

    return _generic_card(n)


def _claim_card(n: Notification) -> CardContext:
    from modules.claims.models import ClaimApproval, ClaimRequest

    name = _greeting_name(n)
    p = n.payload or {}

    cr = (
        ClaimRequest.all_objects.select_related("employee", "category")
        .filter(id=p.get("claim_request_id"))
        .first()
    )
    if cr is None:
        return _generic_card(n)

    amount_str = _fmt_money(cr.amount, cr.currency_code)

    if n.type == "claim.submitted":
        emp = cr.employee
        who = f"{emp.first_name} {emp.last_name}".strip() if emp else str(cr.employee_id)
        return CardContext(
            greeting_name=name,
            headline=f"{who} submitted a claim for your approval",
            rows=[
                ("Employee", who),
                ("Category", cr.category.name),
                ("Amount", amount_str),
                ("Expense date", _fmt_date(cr.expense_date)),
            ],
            cta_label="Review claim",
            cta_url=_abs(n.deep_link) if n.deep_link else _abs("/claims/approvals"),
        )

    if n.type == "claim.approved":
        return CardContext(
            greeting_name=name,
            headline="Your claim was approved ✅",
            rows=[
                ("Category", cr.category.name),
                ("Amount", amount_str),
                ("Expense date", _fmt_date(cr.expense_date)),
                ("Merchant", cr.merchant),
            ],
            cta_url=_abs(n.deep_link),
        )

    if n.type == "claim.rejected":
        appr = (
            ClaimApproval.objects.filter(claim=cr, status="rejected")
            .order_by("-acted_at")
            .first()
        )
        rows: list[tuple[str, str]] = [
            ("Category", cr.category.name),
            ("Amount", amount_str),
        ]
        if appr and appr.comment:
            rows.append(("Reason", appr.comment))
        return CardContext(
            greeting_name=name,
            headline="Your claim wasn't approved",
            rows=rows,
            cta_url=_abs(n.deep_link),
            whats_next="Amend and resubmit.",
        )

    if n.type == "claim.reimbursed":
        return CardContext(
            greeting_name=name,
            headline="Your claim has been reimbursed \U0001f4b8",
            rows=[
                ("Category", cr.category.name),
                ("Amount", amount_str),
                ("Merchant", cr.merchant),
                ("Status", cr.get_status_display()),
            ],
            cta_url=_abs(n.deep_link),
        )

    return _generic_card(n)


def _incentive_card(n: Notification) -> CardContext:
    """Incentive mandays-claim notifications — payloads are rich, no DB hydration needed."""
    name = _greeting_name(n)
    p = n.payload or {}

    suffix = (n.type or "").split(".")[-1]  # claim_submitted / claim_approved / claim_rejected
    headline_map = {
        "claim_submitted": "Your mandays claim was submitted",
        "claim_approved": "Your mandays claim was approved ✅",
        "claim_rejected": "Your mandays claim was rejected",
    }
    headline = headline_map.get(suffix, f"Your mandays claim was {suffix.replace('claim_', '')}")

    rows: list[tuple[str, str]] = [
        ("Project", str(p.get("project", ""))),
        ("Mandays", str(p.get("mandays", ""))),
    ]
    reason = p.get("reason", "")
    if suffix == "claim_rejected" and reason:
        rows.append(("Reason", reason))

    return CardContext(
        greeting_name=name,
        headline=headline,
        rows=rows,
        cta_url=_abs(n.deep_link),
    )


# domain prefix -> builder(n) -> CardContext. Populated by later tasks.
DOMAIN_BUILDERS: dict[str, Callable[[Notification], CardContext]] = {}

DOMAIN_BUILDERS["leave"] = _leave_card
DOMAIN_BUILDERS["claim"] = _claim_card
DOMAIN_BUILDERS["incentive"] = _incentive_card


def build_card(n: Notification) -> CardContext:
    try:
        domain = (n.type or "").split(".")[0]
        builder = DOMAIN_BUILDERS.get(domain)
        if builder is not None:
            return builder(n)
    except Exception:
        logger.exception("Card builder failed for %s; using generic", n.type)
    return _generic_card(n)
