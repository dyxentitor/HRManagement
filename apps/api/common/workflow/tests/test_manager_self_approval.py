"""Top-of-chain manager self-approval (opt-in, claims only).

Business rule agreed with the owner: a requester holding the ``manager`` role
may clear their own level-1 stage when nobody sits above them. Without this,
``engine.submit`` raises ``NoApproverFound`` and such a manager cannot file a
claim at all.

Scope is deliberately narrow and these tests pin every edge of it:
* opt-in per chain — claims yes, leave no (leave is single-step, so
  self-approval there would be a fully self-granted absence);
* role-gated — a non-manager with no manager above is still refused;
* intent-gated — a resolver that names the requester *accidentally* (no
  ``allow_self_approval`` flag) is still refused by the engine.
"""

from __future__ import annotations

import datetime
import os
from dataclasses import dataclass, field
from typing import Any

import pytest
from cryptography.fernet import Fernet

from common.workflow.chain import ApprovalStep, WorkflowChain
from common.workflow.engine import Decision, NoApproverFound, NotAuthorizedToAct, WorkflowEngine
from common.workflow.resolvers import DirectManagerResolver
from modules.employee.models import Employee
from modules.identity.models import Role, User, UserRole
from modules.organization.models import Department, Organization

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@dataclass
class FakeSubject:
    employee: Any
    status: str = "submitted"
    current_level: int = 1
    extra: dict = field(default_factory=dict)


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="SelfApp",
        slug="selfapp",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def _employee(org: Organization, code: str, user: User | None, manager=None) -> Employee:
    dept = Department.all_objects.filter(org_id=org.id).first() or Department.all_objects.create(
        org_id=org.id, name="Ops"
    )
    return Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=code,
        first_name=code,
        last_name="x",
        email=f"{code}@selfapp.com",
        department=dept,
        manager=manager,
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
    )


def _user(org: Organization, email: str, *, role_code: str | None = None) -> User:
    u = User.objects.create_user(
        email=email, password="x", org_id=org.id
    )  # pragma: allowlist secret
    if role_code:
        role, _ = Role.objects.get_or_create(
            org_id=org.id, code=role_code, defaults={"name": role_code, "is_system": True}
        )
        UserRole.objects.create(user=u, role=role)
    return u


def _claims_like_chain() -> WorkflowChain:
    """Mirrors the claim chains' level-1 stage (self-approval opted in)."""
    return WorkflowChain(
        code="claim_under_500",
        steps=[ApprovalStep(level=1, resolver=DirectManagerResolver(allow_self_approval=True))],
    )


def _leave_like_chain() -> WorkflowChain:
    """Mirrors leave: the same resolver WITHOUT the opt-in."""
    return WorkflowChain(
        code="leave_default",
        steps=[ApprovalStep(level=1, resolver=DirectManagerResolver())],
    )


# --- the capability itself -------------------------------------------------


def test_top_of_chain_manager_can_submit_a_claim(org) -> None:
    """Previously raised NoApproverFound — the bug that blocked Kelvin Tan et al."""
    u = _user(org, "mgr@selfapp.com", role_code="manager")
    emp = _employee(org, "MGR1", u, manager=None)  # nobody above
    subj = FakeSubject(employee=emp, status="draft", current_level=0)

    WorkflowEngine().submit(subj, chain=_claims_like_chain())
    assert subj.status == "submitted"
    assert subj.current_level == 1


def test_top_of_chain_manager_can_approve_their_own_claim_level_1(org) -> None:
    u = _user(org, "mgr@selfapp.com", role_code="manager")
    emp = _employee(org, "MGR1", u, manager=None)
    subj = FakeSubject(employee=emp)

    WorkflowEngine().act(subj, chain=_claims_like_chain(), actor=u, decision=Decision.APPROVE)
    # Single-step test chain, so it completes; the real claim chains carry a
    # mandatory Finance stage after this one.
    assert subj.status == "approved"


# --- the boundaries --------------------------------------------------------


def test_non_manager_with_no_manager_above_is_still_refused(org) -> None:
    """Role-gated: the opt-in only applies to the ``manager`` role."""
    u = _user(org, "emp@selfapp.com")  # no role
    emp = _employee(org, "EMP1", u, manager=None)

    with pytest.raises(NoApproverFound):
        WorkflowEngine().submit(
            FakeSubject(employee=emp, status="draft", current_level=0),
            chain=_claims_like_chain(),
        )

    with pytest.raises(NotAuthorizedToAct):
        WorkflowEngine().act(
            FakeSubject(employee=emp),
            chain=_claims_like_chain(),
            actor=u,
            decision=Decision.APPROVE,
        )


def test_manager_cannot_self_approve_LEAVE(org) -> None:
    """Leave must be unaffected — it is a single-step chain with no later gate."""
    u = _user(org, "mgr@selfapp.com", role_code="manager")
    emp = _employee(org, "MGR1", u, manager=None)

    with pytest.raises(NotAuthorizedToAct):
        WorkflowEngine().act(
            FakeSubject(employee=emp), chain=_leave_like_chain(), actor=u, decision=Decision.APPROVE
        )


def test_manager_with_a_manager_above_still_routes_upward(org) -> None:
    """Self-approval is a fallback, not a shortcut: if a boss exists, they approve."""
    boss = _user(org, "boss@selfapp.com", role_code="manager")
    boss_emp = _employee(org, "BOSS", boss, manager=None)
    sub = _user(org, "sub@selfapp.com", role_code="manager")
    sub_emp = _employee(org, "SUB", sub, manager=boss_emp)

    # the subordinate manager may NOT self-approve — it routes to the boss
    with pytest.raises(NotAuthorizedToAct):
        WorkflowEngine().act(
            FakeSubject(employee=sub_emp),
            chain=_claims_like_chain(),
            actor=sub,
            decision=Decision.APPROVE,
        )
    # ...and the boss can
    subj = FakeSubject(employee=sub_emp)
    WorkflowEngine().act(subj, chain=_claims_like_chain(), actor=boss, decision=Decision.APPROVE)
    assert subj.status == "approved"


class _AccidentalSelfResolver:
    """A resolver that names the requester WITHOUT declaring the opt-in."""

    def resolve(self, subject_employee, request):
        return getattr(subject_employee, "user", None)


def test_accidental_self_match_is_still_refused(org) -> None:
    """Intent-gated: only an explicit ``allow_self_approval`` resolver qualifies.

    Guards the v1.10.1 defence-in-depth property — a resolver naming the
    requester through data drift must not become a self-approval loophole.
    """
    u = _user(org, "mgr@selfapp.com", role_code="manager")
    emp = _employee(org, "MGR1", u, manager=None)
    chain = WorkflowChain(
        code="drifted", steps=[ApprovalStep(level=1, resolver=_AccidentalSelfResolver())]
    )

    with pytest.raises(NotAuthorizedToAct):
        WorkflowEngine().act(
            FakeSubject(employee=emp), chain=chain, actor=u, decision=Decision.APPROVE
        )
