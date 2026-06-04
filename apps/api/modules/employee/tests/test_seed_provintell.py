"""Smoke test: seed_provintell management command is idempotent."""

from __future__ import annotations

import pytest
from django.core.management import call_command

from modules.employee.models import Employee
from modules.identity.models import Role, User, UserRole
from modules.organization.models import Organization


@pytest.mark.django_db(transaction=True)
def test_seed_provintell_idempotent():
    """Running seed_provintell twice must not create duplicate employees."""
    call_command("seed_provintell")
    n_emps = Employee.all_objects.filter(deleted_at__isnull=True).count()
    assert n_emps >= 5, f"Expected at least 5 employees after first seed, got {n_emps}"

    call_command("seed_provintell")
    n_emps2 = Employee.all_objects.filter(deleted_at__isnull=True).count()
    assert n_emps2 == n_emps, (
        f"Idempotency violated: {n_emps} employees after first run, {n_emps2} after second run"
    )


@pytest.mark.django_db(transaction=True)
def test_seed_provintell_covers_every_default_role():
    """Every default role must have at least one demo login so a per-role RBAC
    smoke check (CLAUDE.md §3.16) can exercise all roles. Regression guard for
    the v1.10.1 onboarding gap where team_lead/employee/auditor had no account."""
    call_command("seed_provintell")
    org = Organization.objects.get(slug="provintell")

    roles_with_users = set(
        UserRole.objects.filter(role__org_id=org.id).values_list("role__code", flat=True)
    )
    all_roles = set(Role.objects.filter(org_id=org.id).values_list("code", flat=True))
    missing = all_roles - roles_with_users
    assert not missing, f"Default roles with no demo login: {sorted(missing)}"


@pytest.mark.django_db(transaction=True)
def test_seed_provintell_links_self_service_roles_to_employees():
    """employee/team_lead demo users must be linked to a real Employee row so
    their self-service pages (filtered by Employee.id) return data, not 403/empty."""
    call_command("seed_provintell")
    org = Organization.objects.get(slug="provintell")
    for email in ("employee@provintell.demo", "team.lead@provintell.demo"):
        user = User.objects.get(email=email, org_id=org.id)
        assert Employee.all_objects.filter(org_id=org.id, user_id=user.id).exists(), (
            f"{email} is not linked to an Employee record"
        )


@pytest.mark.django_db(transaction=True)
def test_seed_provintell_no_employees_skips_employees_keeps_logins():
    """--no-employees creates 0 Employee rows but still scaffolds the org, roles,
    and (non-prod) demo logins — the 'logins only' onboarding choice."""
    call_command("seed_provintell", "--no-employees")
    org = Organization.objects.get(slug="provintell")

    assert Employee.all_objects.filter(org_id=org.id).count() == 0
    # Org + roles still present
    assert Role.objects.filter(org_id=org.id).exists()
    # Demo logins still created (one per role)
    roles_with_users = set(
        UserRole.objects.filter(role__org_id=org.id).values_list("role__code", flat=True)
    )
    all_roles = set(Role.objects.filter(org_id=org.id).values_list("code", flat=True))
    assert all_roles and all_roles == roles_with_users


@pytest.mark.django_db(transaction=True)
def test_seed_provintell_prod_no_employees_is_empty_scaffold():
    """--prod --no-employees yields an empty org scaffold: no employees and no
    demo accounts, but org + roles present — the 'nothing' onboarding choice."""
    call_command("seed_provintell", "--prod", "--no-employees")
    org = Organization.objects.get(slug="provintell")

    assert Employee.all_objects.filter(org_id=org.id).count() == 0
    assert not User.objects.filter(email__endswith="@provintell.demo", org_id=org.id).exists()
    assert Role.objects.filter(org_id=org.id).exists()


@pytest.mark.django_db(transaction=True)
def test_seed_provintell_no_employees_idempotent():
    """--no-employees must be safe to re-run (no duplicate rows, stays at 0 emps)."""
    call_command("seed_provintell", "--no-employees")
    call_command("seed_provintell", "--no-employees")
    org = Organization.objects.get(slug="provintell")
    assert Employee.all_objects.filter(org_id=org.id).count() == 0
