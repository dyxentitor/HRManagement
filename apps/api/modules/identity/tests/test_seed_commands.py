"""Tests for seed_permission_catalogue and seed_default_roles."""

import uuid

import pytest
from django.core.management import call_command

from modules.identity.models import Permission, Role, RolePermission


@pytest.mark.django_db
def test_seed_permission_catalogue_loads_m1b_codes() -> None:
    call_command("seed_permission_catalogue")
    codes = set(Permission.objects.values_list("code", flat=True))
    # Spot-check a few critical ones
    assert "auth:mfa:manage:self" in codes
    assert "user:invite" in codes
    assert "department:write" in codes
    assert "audit:payroll-ledger:verify:org" in codes
    assert len(codes) >= 18


@pytest.mark.django_db
def test_seed_permission_catalogue_idempotent() -> None:
    call_command("seed_permission_catalogue")
    n = Permission.objects.count()
    call_command("seed_permission_catalogue")
    assert Permission.objects.count() == n


@pytest.mark.django_db
def test_seed_default_roles_creates_seven_roles_for_org() -> None:
    org_id = uuid.uuid4()
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org_id))
    codes = set(Role.objects.filter(org_id=org_id).values_list("code", flat=True))
    assert codes == {
        "org_admin",
        "hr_manager",
        "finance",
        "manager",
        "team_lead",
        "employee",
        "auditor",
    }


@pytest.mark.django_db
def test_seed_default_roles_links_permissions() -> None:
    org_id = uuid.uuid4()
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org_id))
    org_admin = Role.objects.get(org_id=org_id, code="org_admin")
    perm_codes = set(org_admin.permissions.values_list("code", flat=True))
    assert "user:invite" in perm_codes
    assert "audit:payroll-ledger:verify:org" in perm_codes


@pytest.mark.django_db
def test_seed_default_roles_idempotent_per_org() -> None:
    org_id = uuid.uuid4()
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org_id))
    n_roles = Role.objects.filter(org_id=org_id).count()
    n_links = RolePermission.objects.filter(role__org_id=org_id).count()

    call_command("seed_default_roles", "--org-id", str(org_id))
    assert Role.objects.filter(org_id=org_id).count() == n_roles
    assert RolePermission.objects.filter(role__org_id=org_id).count() == n_links


@pytest.mark.django_db
def test_seed_default_roles_requires_existing_permissions() -> None:
    """If permission catalogue hasn't been seeded yet, seeding roles should error clearly."""
    from django.core.management.base import CommandError

    org_id = uuid.uuid4()
    with pytest.raises(CommandError):
        call_command("seed_default_roles", "--org-id", str(org_id))


@pytest.mark.django_db
def test_seed_permission_catalogue_loads_m2_codes() -> None:
    call_command("seed_permission_catalogue")
    codes = set(Permission.objects.values_list("code", flat=True))
    # Spot-check M2 codes
    assert "employee:read:org" in codes
    assert "employee:write:self" in codes
    assert "employee:bank:read" in codes
    assert "employee:salary:write" in codes
    assert len(codes) >= 29


@pytest.mark.django_db
def test_seed_permission_catalogue_loads_m3_codes() -> None:
    call_command("seed_permission_catalogue")
    codes = set(Permission.objects.values_list("code", flat=True))
    # Spot-check M3 leave codes
    assert "leave:request:create:self" in codes
    assert "leave:balance:read:org" in codes
    assert "leave:type:write" in codes
    assert "leave:delegation:write:self" in codes
    assert len(codes) >= 43


@pytest.mark.django_db
def test_seed_permission_catalogue_loads_m4_codes() -> None:
    call_command("seed_permission_catalogue")
    codes = set(Permission.objects.values_list("code", flat=True))
    assert "schedule:assignment:write:team" in codes
    assert "attendance:clock:self" in codes
    assert "schedule:holiday:write" in codes
    assert len(codes) >= 58  # 43 from M1b/M2/M3 + 15 from M4


@pytest.mark.django_db
def test_seed_permission_catalogue_loads_m5_codes() -> None:
    call_command("seed_permission_catalogue")
    codes = set(Permission.objects.values_list("code", flat=True))
    assert "claim:create:self" in codes
    assert "claim:approve:team" in codes
    assert "claim:reimburse:finance" in codes
    assert "claim:category:write" in codes
    assert len(codes) >= 69  # 58 from M1b-M4 + 11 from M5


@pytest.mark.django_db
def test_seed_permission_catalogue_loads_m6_codes() -> None:
    call_command("seed_permission_catalogue")
    codes = set(Permission.objects.values_list("code", flat=True))
    assert "payslip:read:self" in codes
    assert "payslip:read:org" in codes
    assert "payroll:run:create" in codes
    assert "payroll:run:publish" in codes
    assert "payroll:component:write" in codes
    assert "payroll:period:write" in codes
    assert len(codes) >= 75  # 69 from M1b-M5 + 6 from M6


@pytest.mark.django_db
def test_seed_permission_catalogue_loads_m7_codes() -> None:
    call_command("seed_permission_catalogue")
    codes = set(Permission.objects.values_list("code", flat=True))
    assert "kpi:cycle:read" in codes
    assert "kpi:cycle:write" in codes
    assert "kpi:template:read" in codes
    assert "kpi:template:write" in codes
    assert "kpi:assignment:read:self" in codes
    assert "kpi:assignment:read:team" in codes
    assert "kpi:assignment:write:team" in codes
    assert "kpi:review:write:self" in codes
    assert "kpi:review:write:team" in codes
    assert len(codes) >= 84  # 75 from M1b-M6 + 9 from M7


@pytest.mark.django_db
def test_seed_permission_catalogue_loads_m8_codes() -> None:
    call_command("seed_permission_catalogue")
    codes = set(Permission.objects.values_list("code", flat=True))
    assert "cert:read:self" in codes
    assert "cert:read:org" in codes
    assert "cert:write:self" in codes
    assert "cert:write:org" in codes
    assert "training:plan:read" in codes
    assert "training:plan:write" in codes
    assert "training:assignment:read:self" in codes
    assert "training:assignment:write:team" in codes
    assert "training:progress:write:self" in codes
    assert len(codes) >= 94  # 84 from M1b-M7 + 10 from M8


@pytest.mark.django_db
def test_seed_permission_catalogue_loads_m9_codes() -> None:
    call_command("seed_permission_catalogue")
    codes = set(Permission.objects.values_list("code", flat=True))
    assert "notification:read:self" in codes
    assert "notification:preferences:write:self" in codes
    assert "notification:digest:read:org" in codes
    assert len(codes) >= 97  # 94 from M1b-M8 + 3 from M9


@pytest.mark.django_db
def test_seed_permission_catalogue_loads_m10_codes() -> None:
    call_command("seed_permission_catalogue")
    codes = set(Permission.objects.values_list("code", flat=True))
    assert "dashboard:read:me" in codes
    assert "dashboard:read:team" in codes
    assert "dashboard:read:admin" in codes
    assert "approvals:inbox:read" in codes
    assert len(codes) >= 101  # 97 from M1b-M9 + 4 from M10
