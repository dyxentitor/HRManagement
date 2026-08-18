"""The two shift-swap perms exist and land on the right roles."""

from __future__ import annotations

from pathlib import Path

import yaml

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"

REQUEST = "schedule:swap:request:self"
APPROVE = "schedule:swap:approve:team"


def _catalogue_codes():
    codes = set()
    for f in FIXTURES.glob("permissions_*.yaml"):
        for entry in yaml.safe_load(f.read_text()) or []:
            codes.add(entry["code"])
    return codes


def _roles():
    return {r["code"]: r for r in yaml.safe_load((FIXTURES / "default_roles.yaml").read_text())}


def test_both_codes_are_in_the_catalogue():
    codes = _catalogue_codes()
    assert REQUEST in codes
    assert APPROVE in codes


def test_request_perm_on_every_shift_holding_role():
    roles = _roles()
    for code in ("employee", "team_lead", "manager", "finance", "auditor",
                 "hr_manager", "org_admin"):
        assert REQUEST in roles[code]["permissions"], f"{code} missing {REQUEST}"


def test_approve_perm_only_on_approver_roles():
    roles = _roles()
    for code in ("manager", "team_lead", "hr_manager", "org_admin"):
        assert APPROVE in roles[code]["permissions"], f"{code} missing {APPROVE}"
    assert APPROVE not in roles["employee"]["permissions"]
