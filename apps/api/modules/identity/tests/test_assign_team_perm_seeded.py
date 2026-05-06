"""After seeding default roles, the new employee:assign:team perm and the
team:write grant land on the right roles (v1.6.0)."""

from __future__ import annotations

import pytest
from django.core.management import call_command

from modules.identity.models import Permission, Role, RolePermission
from modules.organization.models import Organization

pytestmark = pytest.mark.django_db


@pytest.fixture
def org() -> Organization:
    org = Organization.objects.create(
        slug="acme",
        name="Acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
        status="active",
    )
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", org_id=str(org.id))
    return org


def _role_codes(role: Role) -> set[str]:
    return set(RolePermission.objects.filter(role=role).values_list("permission__code", flat=True))


def test_assign_team_perm_is_in_catalogue(org: Organization) -> None:
    assert Permission.objects.filter(code="employee:assign:team").exists()


@pytest.mark.parametrize("role_code", ["org_admin", "hr_manager", "manager", "team_lead"])
def test_assign_team_granted_to_role(org: Organization, role_code: str) -> None:
    role = Role.objects.get(org_id=org.id, code=role_code)
    assert "employee:assign:team" in _role_codes(role)


def test_team_write_granted_to_hr_manager(org: Organization) -> None:
    hr = Role.objects.get(org_id=org.id, code="hr_manager")
    assert "team:write" in _role_codes(hr)


def test_assign_team_not_granted_to_employee_or_finance(org: Organization) -> None:
    """Negative — only the four target roles get the new perm."""
    for code in ("employee", "finance", "auditor"):
        role = Role.objects.get(org_id=org.id, code=code)
        assert "employee:assign:team" not in _role_codes(role)
