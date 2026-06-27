"""Employee code generation — {PREFIX}-{YYYY}-{NNNN}, gap-tolerant, org-scoped."""

from __future__ import annotations

import datetime as dt
import re

from modules.employee.models import Employee
from modules.organization.models import Organization

DEFAULT_PREFIX = "EMP"


def employee_code_prefix(org_id) -> str:
    org = Organization.objects.filter(id=org_id).only("settings").first()
    prefix = (org.settings or {}).get("employee_code_prefix") if org else None
    return (prefix or DEFAULT_PREFIX).strip() or DEFAULT_PREFIX


def next_employee_code(org_id) -> str:
    """Next non-clashing code for the org: max counter for this prefix+year, +1."""
    prefix = employee_code_prefix(org_id)
    year = dt.date.today().year
    head = f"{prefix}-{year}-"
    pattern = re.compile(rf"^{re.escape(prefix)}-{year}-(\d+)$")
    highest = 0
    codes = Employee.all_objects.filter(
        org_id=org_id, employee_code__startswith=head
    ).values_list("employee_code", flat=True)
    for code in codes:
        m = pattern.match(code or "")
        if m:
            highest = max(highest, int(m.group(1)))
    return f"{head}{highest + 1:04d}"
