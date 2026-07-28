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


# domain prefix -> builder(n) -> CardContext. Populated by later tasks.
DOMAIN_BUILDERS: dict[str, Callable[[Notification], CardContext]] = {}


def build_card(n: Notification) -> CardContext:
    try:
        domain = (n.type or "").split(".")[0]
        builder = DOMAIN_BUILDERS.get(domain)
        if builder is not None:
            return builder(n)
    except Exception:
        logger.exception("Card builder failed for %s; using generic", n.type)
    return _generic_card(n)
