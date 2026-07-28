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
            # The real call site (_notify_for_claim) always sets deep_link="/claims/me"
            # even for approver notifications, so we must hardcode the approvals URL here.
            cta_url=_abs("/claims/approvals"),
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


def _payslip_card(n: Notification) -> CardContext:
    from modules.payslip.models import PayslipRecord

    name = _greeting_name(n)
    p = n.payload or {}

    ps = (
        PayslipRecord.all_objects.select_related("period")
        .filter(id=p.get("payslip_id"))
        .first()
    )
    if ps is None:
        return _generic_card(n)

    period = ps.period
    return CardContext(
        greeting_name=name,
        headline=f"Your payslip for {period.period_start:%B} is ready \U0001f4c4",
        rows=[
            ("Pay period", _fmt_range(period.period_start, period.period_end)),
            ("Pay date", _fmt_date(period.pay_date)),
            ("Net pay", _fmt_money(ps.net, ps.currency_code)),
        ],
        cta_label="View payslip",
        cta_url=_abs(n.deep_link),
        whats_next="Download the PDF in HRMS.",
    )


def _cert_card(n: Notification) -> CardContext:
    name = _greeting_name(n)
    p = n.payload or {}

    cert_name = str(p.get("cert_name", ""))
    days_remaining = p.get("days_remaining", "")
    expires_on_raw = p.get("expires_on", "")

    # Parse expires_on — best-effort
    try:
        expires_date = datetime.date.fromisoformat(str(expires_on_raw))
        expires_str = _fmt_date(expires_date)
    except Exception:
        expires_str = str(expires_on_raw)

    # Optionally hydrate for issuer
    issuer: str | None = None
    cert_id = p.get("cert_id")
    if cert_id:
        try:
            from modules.certification.models import Certification

            cert_obj = Certification.all_objects.filter(id=cert_id).first()
            if cert_obj and cert_obj.issuer:
                issuer = cert_obj.issuer
        except Exception:
            pass

    rows: list[tuple[str, str]] = [("Certificate", cert_name)]
    if issuer:
        rows.append(("Issuer", issuer))
    rows.append(("Expires on", expires_str))
    rows.append(("Days left", str(days_remaining)))

    return CardContext(
        greeting_name=name,
        headline=f"Your {cert_name} certificate expires soon ⏰",
        rows=rows,
        cta_label="View certifications",
        cta_url=_abs(n.deep_link),
        whats_next="Renew before it lapses.",
    )


def _roster_card(n: Notification) -> CardContext:
    name = _greeting_name(n)
    p = n.payload or {}

    # Parse date_from / date_to — best-effort
    try:
        date_from = datetime.date.fromisoformat(str(p.get("date_from", "")))
    except Exception:
        date_from = None  # type: ignore[assignment]
    try:
        date_to = datetime.date.fromisoformat(str(p.get("date_to", "")))
    except Exception:
        date_to = None  # type: ignore[assignment]

    period_str = _fmt_range(date_from, date_to) if (date_from and date_to) else str(p.get("date_from", ""))

    return CardContext(
        greeting_name=name,
        headline="A new roster is published \U0001f5d3️",
        rows=[("Period", period_str)],
        cta_label="View my schedule",
        cta_url=_abs(n.deep_link),
    )


# domain prefix -> builder(n) -> CardContext. Populated by later tasks.
DOMAIN_BUILDERS: dict[str, Callable[[Notification], CardContext]] = {}

def _assignment_card(n: Notification) -> CardContext:
    """Assignment task notifications — payload carries title + due date."""
    name = _greeting_name(n)
    p = n.payload or {}

    title = str(p.get("title", ""))
    due_raw = p.get("due", "")

    # Parse due date — best-effort
    try:
        due_date = datetime.date.fromisoformat(str(due_raw))
        due_str = _fmt_date(due_date)
    except Exception:
        due_str = str(due_raw)

    suffix = (n.type or "").split(".")[-1]

    if suffix == "assigned":
        rows: list[tuple[str, str]] = [("Task", title), ("Due date", due_str)]
        task_type = p.get("type")
        if task_type:
            rows.append(("Type", str(task_type)))
        return CardContext(
            greeting_name=name,
            headline=f"New task: {title}",
            rows=rows,
            cta_url=_abs(n.deep_link),
        )

    if suffix == "reminder":
        return CardContext(
            greeting_name=name,
            headline=f"Reminder: {title} is due soon ⏰",
            rows=[("Task", title), ("Due date", due_str)],
            cta_url=_abs(n.deep_link),
            whats_next="Due soon.",
        )

    if suffix == "overdue":
        return CardContext(
            greeting_name=name,
            headline=f"Overdue: {title}",
            rows=[("Task", title), ("Due date", due_str)],
            cta_url=_abs(n.deep_link),
            whats_next="This task is now overdue.",
        )

    return _generic_card(n)


def _kpi_card(n: Notification) -> CardContext:
    """KPI cycle and review notifications — payload carries cycle name."""
    name = _greeting_name(n)
    p = n.payload or {}

    cycle = str(p.get("cycle", ""))
    suffix = (n.type or "").split(".")[-1]

    if suffix == "cycle_opens_self_review":
        rows: list[tuple[str, str]] = [("Cycle", cycle)] if cycle else []
        return CardContext(
            greeting_name=name,
            headline=f"Your self-review is open for {cycle}",
            rows=rows,
            cta_label="Start self-review",
            cta_url=_abs("/kpi/me"),
        )

    if suffix == "cycle_opens_manager_review":
        rows = [("Cycle", cycle)] if cycle else []
        return CardContext(
            greeting_name=name,
            headline=f"Manager reviews are open for {cycle}",
            rows=rows,
            cta_label="Open reviews",
            cta_url=_abs("/kpi/admin"),
        )

    if suffix in ("review_submitted_self", "review_submitted_manager"):
        # The real call site (modules/kpi/services/review.py) sends only
        # {"assignment_id": str(assignment.id)} — no "cycle" key — so hydrate
        # the cycle name from the KpiAssignment row instead of reading p["cycle"].
        cycle_name: str = cycle  # may be non-empty if caller added it (forward-compat)
        if not cycle_name:
            assignment_id = p.get("assignment_id")
            if assignment_id:
                try:
                    from modules.kpi.models import KpiAssignment

                    ka = (
                        KpiAssignment.all_objects.filter(id=assignment_id)
                        .select_related("cycle")
                        .first()
                    )
                    if ka is not None:
                        cycle_name = ka.cycle.name
                except Exception:
                    pass
        rows = [("Cycle", cycle_name)] if cycle_name else []
        return CardContext(
            greeting_name=name,
            headline="A KPI review was submitted",
            rows=rows,
            cta_url=_abs(n.deep_link),
        )

    return _generic_card(n)


def _employee_card(n: Notification) -> CardContext:
    """Employee tenure notifications — probation/contract ending soon.

    Payload: {"employee_id", "employee_code", "name"}
    Hydrates Employee via all_objects for the end date field.
    Falls back to payload-only card if the Employee row cannot be found.
    employee.bank_changed_self is a security type handled elsewhere; fall
    through to _generic_card if it somehow reaches here.
    """
    name = _greeting_name(n)
    p = n.payload or {}

    suffix = (n.type or "").split(".")[-1]

    # Security type — should not reach this builder, but guard it
    if suffix == "bank_changed_self":
        return _generic_card(n)

    emp_name = str(p.get("name", ""))
    emp_code = str(p.get("employee_code", ""))
    employee_id = p.get("employee_id")

    # Hydrate Employee row (tenant-scoped via all_objects)
    emp = None
    if employee_id:
        try:
            from modules.employee.models import Employee

            emp = Employee.all_objects.filter(id=employee_id).first()
        except Exception:
            pass

    is_probation = suffix == "probation_ending_soon"
    tenure_label = "probation" if is_probation else "contract"
    headline = f"{emp_name}'s {tenure_label} ends in 30 days"

    rows: list[tuple[str, str]] = [
        ("Employee", f"{emp_name} ({emp_code})" if emp_code else emp_name),
    ]

    # End date from hydrated Employee
    end_date = None
    if emp is not None:
        end_date = emp.probation_end_date if is_probation else emp.contract_end_date

    if end_date is not None:
        rows.append(("End date", _fmt_date(end_date)))

        # Days left — compute from today
        try:
            today = datetime.date.today()
            days_left = (end_date - today).days
            rows.append(("Days left", str(max(days_left, 0))))
        except Exception:
            rows.append(("Days left", "30"))
    else:
        rows.append(("Days left", "30"))

    return CardContext(
        greeting_name=name,
        headline=headline,
        rows=rows,
        cta_label="View employee",
        cta_url=_abs(n.deep_link),
        whats_next="Review and confirm next steps.",
    )


DOMAIN_BUILDERS["leave"] = _leave_card
DOMAIN_BUILDERS["claim"] = _claim_card
DOMAIN_BUILDERS["incentive"] = _incentive_card
DOMAIN_BUILDERS["payslip"] = _payslip_card
DOMAIN_BUILDERS["cert"] = _cert_card
DOMAIN_BUILDERS["schedule"] = _roster_card
DOMAIN_BUILDERS["assignment"] = _assignment_card
DOMAIN_BUILDERS["kpi"] = _kpi_card
DOMAIN_BUILDERS["employee"] = _employee_card


def build_card(n: Notification) -> CardContext:
    try:
        domain = (n.type or "").split(".")[0]
        builder = DOMAIN_BUILDERS.get(domain)
        if builder is not None:
            return builder(n)
    except Exception:
        logger.exception("Card builder failed for %s; using generic", n.type)
    return _generic_card(n)
