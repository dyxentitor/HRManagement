"""Effective approver routing: delegation lookup -> leave-fallback -> original."""

import datetime
import os

import pytest
from cryptography.fernet import Fernet

from common.workflow.routing import get_effective_approver
from common.workflow.service import DelegationService
from modules.employee.models import Employee
from modules.identity.models import User
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


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
def chain_users(org: Organization, dept: Department):
    """Build a chain of three users + linked employees: emp -> mgr -> grandmgr."""
    grandmgr_user = User.objects.create_user(
        email="gm@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    mgr_user = User.objects.create_user(
        email="mgr@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    emp_user = User.objects.create_user(
        email="emp@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret

    grandmgr = Employee.all_objects.create(
        org_id=org.id,
        user=grandmgr_user,
        employee_code="GM",
        first_name="GM",
        last_name="x",
        email="gm@x.com",
        phone="+1",
        date_of_birth=datetime.date(1980, 1, 1),
        gender="other",
        nationality="MY",
        marital_status="single",
        address_line1="x",
        city="x",
        state="x",
        postcode="00000",
        country_code="MY",
        department=dept,
        role_title="x",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        bank_name="x",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )
    mgr = Employee.all_objects.create(
        org_id=org.id,
        user=mgr_user,
        employee_code="MGR",
        first_name="MGR",
        last_name="x",
        email="mgr@x.com",
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
        manager=grandmgr,
        role_title="x",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        bank_name="x",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )
    return grandmgr_user, mgr_user, emp_user, mgr


@pytest.mark.django_db
def test_no_delegation_no_leave_returns_original(chain_users) -> None:
    _, mgr_user, _, _ = chain_users
    found = get_effective_approver(
        candidate=mgr_user,
        scope="leave",
        on_date=datetime.date(2026, 5, 7),
        is_on_leave_lookup=lambda _u, _d: False,
    )
    assert found.id == mgr_user.id


@pytest.mark.django_db
def test_active_delegation_overrides_original(chain_users) -> None:
    _, mgr_user, emp_user, _ = chain_users
    DelegationService.create(
        delegator=mgr_user,
        delegate=emp_user,
        scope="leave",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 10),
    )
    found = get_effective_approver(
        candidate=mgr_user,
        scope="leave",
        on_date=datetime.date(2026, 5, 5),
        is_on_leave_lookup=lambda _u, _d: False,
    )
    assert found.id == emp_user.id


@pytest.mark.django_db
def test_leave_fallback_uses_grandmgr_when_no_delegation(chain_users) -> None:
    grandmgr_user, mgr_user, _, _mgr_emp = chain_users
    found = get_effective_approver(
        candidate=mgr_user,
        scope="leave",
        on_date=datetime.date(2026, 5, 5),
        is_on_leave_lookup=lambda u, _d: u.id == mgr_user.id,
    )
    assert found.id == grandmgr_user.id


@pytest.mark.django_db
def test_delegation_takes_priority_over_leave_fallback(chain_users) -> None:
    """Even if mgr is on leave, an explicit delegation wins."""
    _grandmgr_user, mgr_user, emp_user, _ = chain_users
    DelegationService.create(
        delegator=mgr_user,
        delegate=emp_user,
        scope="leave",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 10),
    )
    found = get_effective_approver(
        candidate=mgr_user,
        scope="leave",
        on_date=datetime.date(2026, 5, 5),
        is_on_leave_lookup=lambda u, _d: u.id == mgr_user.id,
    )
    assert found.id == emp_user.id


@pytest.mark.django_db
def test_leave_fallback_returns_candidate_when_no_grandmgr(
    org: Organization, dept: Department
) -> None:
    """If the candidate is on leave but has no manager-of-manager, return the candidate.

    HR can manually intervene; the engine doesn't refuse routing.
    """
    user = User.objects.create_user(
        email="lone@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code="LONE",
        first_name="x",
        last_name="x",
        email="lone@x.com",
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
        role_title="x",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        bank_name="x",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )
    found = get_effective_approver(
        candidate=user,
        scope="leave",
        on_date=datetime.date(2026, 5, 5),
        is_on_leave_lookup=lambda _u, _d: True,
    )
    assert found.id == user.id


@pytest.mark.django_db
def test_returns_none_when_candidate_is_none(chain_users) -> None:
    found = get_effective_approver(
        candidate=None,
        scope="leave",
        on_date=datetime.date(2026, 5, 5),
        is_on_leave_lookup=lambda _u, _d: False,
    )
    assert found is None
