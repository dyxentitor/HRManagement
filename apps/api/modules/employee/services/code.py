"""Employee code generation — configurable {PREFIX}{SEP}{YEAR}{SEP}{NNNN}, gap-tolerant."""

from __future__ import annotations

import datetime as dt

from modules.employee.models import Employee
from modules.organization.models import Organization

DEFAULTS = {
    "prefix": "EMP",
    "separator": "-",
    "include_year": True,
    "year_digits": 4,
    "counter_width": 4,
    "reset": "yearly",
    "autofill": True,
}


def employee_code_config(org_id) -> dict:
    org = Organization.objects.filter(id=org_id).only("settings").first()
    settings = (org.settings if org else None) or {}
    nested = settings.get("employee_code")
    cfg = dict(DEFAULTS)
    if isinstance(nested, dict):
        for k in DEFAULTS:
            if nested.get(k) is not None:
                cfg[k] = nested[k]
    # v1.41.0 flat-prefix fallback (only when the nested object has no prefix)
    flat = settings.get("employee_code_prefix")
    if flat and not (isinstance(nested, dict) and nested.get("prefix")):
        cfg["prefix"] = flat
    # normalise
    cfg["prefix"] = str(cfg["prefix"]).strip() or "EMP"
    cfg["separator"] = cfg["separator"] if cfg["separator"] in ("-", "/", "") else "-"
    cfg["year_digits"] = 2 if cfg["year_digits"] == 2 else 4
    try:
        cfg["counter_width"] = min(6, max(3, int(cfg["counter_width"])))
    except (TypeError, ValueError):
        cfg["counter_width"] = 4
    cfg["include_year"] = bool(cfg["include_year"])
    cfg["reset"] = "yearly" if (cfg["reset"] == "yearly" and cfg["include_year"]) else "never"
    cfg["autofill"] = bool(cfg["autofill"])
    return cfg


def employee_code_prefix(org_id) -> str:
    return employee_code_config(org_id)["prefix"]


def _year_str(cfg: dict, year: int) -> str:
    return str(year) if cfg["year_digits"] == 4 else f"{year % 100:02d}"


def _parse_counter(code: str, cfg: dict, year_str: str) -> int | None:
    """Deterministic fixed-width parse → counter int, or None if the code doesn't fit the config."""
    s = code or ""
    p, sep = cfg["prefix"], cfg["separator"]
    if not s.startswith(p):
        return None
    s = s[len(p) :]
    if sep:
        if not s.startswith(sep):
            return None
        s = s[len(sep) :]
    if cfg["include_year"]:
        yd = cfg["year_digits"]
        block = s[:yd]
        if len(block) < yd or not block.isdigit():
            return None
        if cfg["reset"] == "yearly" and block != year_str:
            return None
        s = s[yd:]
        if sep:
            if not s.startswith(sep):
                return None
            s = s[len(sep) :]
    if not s or not s.isdigit():
        return None
    return int(s)


def next_employee_code(org_id) -> str:
    cfg = employee_code_config(org_id)
    year = dt.date.today().year
    year_str = _year_str(cfg, year)
    head = cfg["prefix"] + cfg["separator"]
    if cfg["include_year"]:
        head += year_str + cfg["separator"]
    highest = 0
    codes = Employee.all_objects.filter(
        org_id=org_id, employee_code__startswith=cfg["prefix"]
    ).values_list("employee_code", flat=True)
    for code in codes:
        n = _parse_counter(code, cfg, year_str)
        if n is not None:
            highest = max(highest, n)
    return head + f"{highest + 1:0{cfg['counter_width']}d}"
