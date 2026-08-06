"""Documents the mandays self-approval POLICY (owner decision, 2026-08-06).

A project owner approving their own mandays claim is **intended behaviour**,
not an oversight. This differs from expense claims, where self-approval is
confined to level 1 and Finance still gates the payout.

Note the asymmetry deliberately accepted here: ``approve`` on a mandays claim
mints the payout immediately — there is no later gate. These tests exist so the
policy is an explicit, reviewable decision rather than an accident of
``_can_review`` omitting a claimant check. If the policy is ever reversed, add
the claimant check to ``ClaimViewSet._can_review`` and invert
``test_project_owner_may_approve_their_own_claim``.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.incentive.models import Claim, Customer, EmployeeBond, Project
from modules.incentive.services import ledger
from modules.organization.models import Department, Organization

pytestmark = pytest.mark.django_db


def _grant(role: Role, *codes: str) -> None:
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


@pytest.fixture
def owner_stack():
    """A manager who OWNS a project and files a claim against it themselves."""
    org = Organization.objects.create(
        name="Inc",
        slug="inc-selfpolicy",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Ops")
    user = User.objects.create_user(
        email="owner@inc.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="mgr_selfpolicy", name="M", is_system=False)
    _grant(role, "incentive:project:write", "incentive:claim")
    UserRole.objects.create(user=user, role=role)

    emp = Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code="OWN-1",
        first_name="Owner",
        last_name="Mgr",
        email="owner@inc.com",
        department=dept,
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )
    EmployeeBond.objects.create(
        org_id=org.id,
        employee_id=emp.id,
        accepted_at=dt.datetime(2024, 1, 1, tzinfo=dt.UTC),
        period_start=dt.date.today() - dt.timedelta(days=30),
        period_end=dt.date.today() + dt.timedelta(days=365),
    )
    customer = Customer.objects.create(org_id=org.id, name="Acme")
    ledger.top_up(customer, Decimal("500"), actor_id=user.id, note="test funding")
    project = Project.objects.create(
        org_id=org.id,
        customer=customer,
        name="Proj",
        budget_mandays=Decimal("100"),
        manager_id=emp.id,  # the claimant owns the project
    )
    client = APIClient()
    client.force_authenticate(user)
    return org, user, emp, project, client


def test_project_owner_may_approve_their_own_claim(owner_stack) -> None:
    """POLICY: intended. Reverse this assertion if the rule ever changes."""
    org, _user, emp, project, client = owner_stack
    claim = Claim.objects.create(
        org_id=org.id,
        project=project,
        employee_id=emp.id,
        mandays=Decimal("5"),
        status="pending",
    )

    resp = client.post(f"/api/v1/incentive/claims/{claim.id}/approve/", {}, format="json")

    assert resp.status_code == 200, resp.content
    claim.refresh_from_db()
    assert claim.status == "approved"


def test_self_approved_claim_mints_a_payout_with_no_later_gate(owner_stack) -> None:
    """Makes the financial consequence explicit: approval IS the payout."""
    org, _user, emp, project, client = owner_stack
    claim = Claim.objects.create(
        org_id=org.id, project=project, employee_id=emp.id, mandays=Decimal("3"), status="pending"
    )

    client.post(f"/api/v1/incentive/claims/{claim.id}/approve/", {}, format="json")

    payouts = claim.ledger_rows.filter(ledger_type="claim_payout")
    assert payouts.count() == 1
    assert payouts.first().to_employee_id == emp.id


def test_unrelated_manager_still_cannot_approve(owner_stack) -> None:
    """Self-approval is permitted; approving a stranger's project is not.

    The rejection is a 404 rather than a 403 because ``get_queryset`` scopes
    claims to projects the manager owns (plus their own), so an unrelated
    manager cannot see the row at all — which also avoids leaking its
    existence. Either status is a valid refusal; what matters is that the
    claim stays pending.
    """
    org, _user, _emp, project, _client = owner_stack
    other = User.objects.create_user(
        email="other@inc.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    role = Role.objects.create(org_id=org.id, code="mgr_other", name="O", is_system=False)
    _grant(role, "incentive:project:write")
    UserRole.objects.create(user=other, role=role)
    Employee.all_objects.create(
        org_id=org.id,
        user=other,
        employee_code="OTH-1",
        first_name="Other",
        last_name="Mgr",
        email="other@inc.com",
        department=Department.all_objects.filter(org_id=org.id).first(),
        employment_type="fulltime",
        hire_date=dt.date(2024, 1, 1),
    )
    claim = Claim.objects.create(
        org_id=org.id,
        project=project,
        employee_id=_emp.id,
        mandays=Decimal("2"),
        status="pending",
    )

    c = APIClient()
    c.force_authenticate(other)
    resp = c.post(f"/api/v1/incentive/claims/{claim.id}/approve/", {}, format="json")

    assert resp.status_code in (403, 404), resp.content
    claim.refresh_from_db()
    assert claim.status == "pending"
