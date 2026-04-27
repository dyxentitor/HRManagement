"""WorkflowEngine state machine — tested against an in-memory fake subject.

The engine is subject-agnostic. Real callers (leave, claims) wrap their
own Request models with the WorkflowSubject Protocol. These tests use a
simple dataclass to verify the transitions.
"""

import datetime
import os
import uuid
from dataclasses import dataclass, field
from typing import Any

import pytest
from cryptography.fernet import Fernet

from common.workflow.chain import ApprovalStep, WorkflowChain
from common.workflow.engine import (
    Decision,
    InvalidTransition,
    NoApproverFound,
    NotAuthorizedToAct,
    WorkflowEngine,
)
from common.workflow.resolvers import DirectManagerResolver
from modules.employee.models import Employee
from modules.identity.models import User
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


@dataclass
class FakeSubject:
    """Simulates a leave/claim request. The engine calls these methods."""

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    org_id: uuid.UUID = field(default_factory=uuid.uuid4)
    employee_id: uuid.UUID = field(default_factory=uuid.uuid4)
    employee: Any = None  # set by tests to the actual Employee
    status: str = "draft"
    current_level: int = 0
    decisions: list = field(default_factory=list)


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def dept(org: Organization) -> Department:
    return Department.all_objects.create(org_id=org.id, name="Eng")


@pytest.fixture
def employees(org: Organization, dept: Department):
    """grandmgr_user, mgr_user, emp_user, emp_employee, mgr_employee."""
    grandmgr_user = User.objects.create_user(
        email="gm@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    mgr_user = User.objects.create_user(
        email="mgr@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    emp_user = User.objects.create_user(
        email="emp@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret

    def _e(code, user, manager=None):
        return Employee.all_objects.create(
            org_id=org.id,
            user=user,
            employee_code=code,
            first_name=code,
            last_name="x",
            email=f"{code}@x.com",
            phone="+1",
            date_of_birth=datetime.date(1985, 1, 1),
            gender="other",
            nationality="MY",
            marital_status="single",
            address_line1="x",
            city="x",
            state="x",
            postcode="00000",
            country_code="MY",
            department=dept,
            manager=manager,
            role_title="x",
            employment_type="fulltime",
            hire_date=datetime.date(2024, 1, 1),
            bank_name="x",
            emergency_contact_name="x",
            emergency_contact_relationship="x",
            emergency_contact_phone="+1",
        )

    gm = _e("GM", grandmgr_user)
    mgr = _e("MGR", mgr_user, manager=gm)
    emp = _e("EMP", emp_user, manager=mgr)
    return grandmgr_user, mgr_user, emp_user, emp, mgr


@pytest.fixture
def single_step_chain() -> WorkflowChain:
    return WorkflowChain(
        code="leave_default",
        steps=[ApprovalStep(level=1, resolver=DirectManagerResolver())],
    )


@pytest.mark.django_db
def test_submit_moves_draft_to_submitted(employees, single_step_chain) -> None:
    _, _, _emp_user, emp_employee, _ = employees
    subj = FakeSubject(
        org_id=emp_employee.org_id,
        employee_id=emp_employee.id,
        employee=emp_employee,
        status="draft",
    )
    engine = WorkflowEngine()
    engine.submit(subj, chain=single_step_chain)
    assert subj.status == "submitted"
    assert subj.current_level == 1


@pytest.mark.django_db
def test_submit_from_non_draft_raises_invalidtransition(employees, single_step_chain) -> None:
    _, _, _, emp_employee, _ = employees
    subj = FakeSubject(employee=emp_employee, status="approved")
    with pytest.raises(InvalidTransition):
        WorkflowEngine().submit(subj, chain=single_step_chain)


@pytest.mark.django_db
def test_submit_raises_when_no_approver_found(employees) -> None:
    _, _, _, emp_employee, _ = employees
    # Subject employee has no manager; default chain still uses DirectManagerResolver
    emp_employee.manager = None
    emp_employee.save()
    chain = WorkflowChain(code="x", steps=[ApprovalStep(level=1, resolver=DirectManagerResolver())])
    subj = FakeSubject(employee=emp_employee, status="draft")
    with pytest.raises(NoApproverFound):
        WorkflowEngine().submit(subj, chain=chain)


@pytest.mark.django_db
def test_act_approve_single_step_terminates_at_approved(employees, single_step_chain) -> None:
    _, mgr_user, _, emp_employee, _ = employees
    subj = FakeSubject(employee=emp_employee, status="draft")
    engine = WorkflowEngine()
    engine.submit(subj, chain=single_step_chain)
    engine.act(
        subj, chain=single_step_chain, actor=mgr_user, decision=Decision.APPROVE, comment="lgtm"
    )
    assert subj.status == "approved"


@pytest.mark.django_db
def test_act_reject_terminates_at_rejected(employees, single_step_chain) -> None:
    _, mgr_user, _, emp_employee, _ = employees
    subj = FakeSubject(employee=emp_employee, status="draft")
    engine = WorkflowEngine()
    engine.submit(subj, chain=single_step_chain)
    engine.act(
        subj, chain=single_step_chain, actor=mgr_user, decision=Decision.REJECT, comment="no"
    )
    assert subj.status == "rejected"


@pytest.mark.django_db
def test_act_by_unauthorized_user_raises(employees, single_step_chain) -> None:
    _, _, emp_user, emp_employee, _ = employees  # emp_user is the subject, NOT the approver
    subj = FakeSubject(employee=emp_employee, status="draft")
    engine = WorkflowEngine()
    engine.submit(subj, chain=single_step_chain)
    with pytest.raises(NotAuthorizedToAct):
        engine.act(subj, chain=single_step_chain, actor=emp_user, decision=Decision.APPROVE)


@pytest.mark.django_db
def test_act_two_step_chain_advances_then_approves(employees) -> None:
    grandmgr_user, mgr_user, _, emp_employee, _ = employees
    chain = WorkflowChain(
        code="two_step",
        steps=[
            ApprovalStep(level=1, resolver=DirectManagerResolver()),
            # Step 2 is an artificial "grandmgr resolver" — use a custom resolver
            ApprovalStep(level=2, resolver=_GrandManagerResolver()),
        ],
    )
    subj = FakeSubject(employee=emp_employee, status="draft")
    engine = WorkflowEngine()
    engine.submit(subj, chain=chain)
    # Level 1: mgr approves
    engine.act(subj, chain=chain, actor=mgr_user, decision=Decision.APPROVE, comment="ok")
    assert subj.status == "submitted"
    assert subj.current_level == 2
    # Level 2: grandmgr approves
    engine.act(subj, chain=chain, actor=grandmgr_user, decision=Decision.APPROVE, comment="ok")
    assert subj.status == "approved"


@pytest.mark.django_db
def test_cancel_moves_to_cancelled_state(employees, single_step_chain) -> None:
    _, _, emp_user, emp_employee, _ = employees
    subj = FakeSubject(employee=emp_employee, status="submitted", current_level=1)
    WorkflowEngine().cancel(subj, actor=emp_user)
    assert subj.status == "cancelled"


class _GrandManagerResolver:
    """Test helper: walks up two levels."""

    def resolve(self, subject_employee, request):
        from modules.identity.services.org import OrgService

        mgr = OrgService().get_direct_manager(subject_employee.id)
        if mgr is None:
            return None
        gm = OrgService().get_direct_manager(mgr.id)
        if gm is None:
            return None
        return getattr(gm, "user", None)
