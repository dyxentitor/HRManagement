"""Resolvers: turn (subject_employee, request) into the user that should approve."""

import datetime
import os

import pytest
from cryptography.fernet import Fernet

from common.workflow.resolvers import (
    DepartmentHeadResolver,
    DirectManagerResolver,
    FallbackResolver,
    FinanceResolver,
    RoleResolver,
)
from modules.employee.models import Employee
from modules.identity.models import (
    Role,
    User,
    UserRole,
)
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


def _make_user(org, email="u@x.com") -> User:
    return User.objects.create_user(
        email=email, password="x", org_id=org.id
    )  # pragma: allowlist secret


def _make_employee(
    org, dept, code: str, manager_emp: Employee | None = None, user: User | None = None
) -> Employee:
    return Employee.all_objects.create(
        org_id=org.id,
        employee_code=code,
        user=user,
        first_name=code,
        last_name="x",
        email=f"{code}@x.com",
        phone="+1",
        date_of_birth=datetime.date(1990, 1, 1),
        gender="other",
        nationality="MY",
        marital_status="single",
        address_line1="x",
        city="x",
        state="x",
        postcode="00000",
        country_code="MY",
        department=dept,
        manager=manager_emp,
        role_title="x",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        bank_name="x",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )


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


@pytest.mark.django_db
def test_direct_manager_resolver_returns_manager_user(org: Organization, dept: Department) -> None:
    manager_user = _make_user(org, email="mgr@x.com")
    manager_emp = _make_employee(org, dept, "MGR", user=manager_user)
    subject_emp = _make_employee(org, dept, "EMP", manager_emp=manager_emp)
    resolver = DirectManagerResolver()
    found = resolver.resolve(subject_emp, request=None)
    assert found is not None and found.id == manager_user.id


@pytest.mark.django_db
def test_direct_manager_resolver_none_when_no_manager(org: Organization, dept: Department) -> None:
    emp = _make_employee(org, dept, "TOP")
    assert DirectManagerResolver().resolve(emp, request=None) is None


@pytest.mark.django_db
def test_direct_manager_resolver_none_when_manager_has_no_user(
    org: Organization, dept: Department
) -> None:
    """If the manager Employee row exists but isn't linked to a User, resolve to None."""
    manager_emp = _make_employee(org, dept, "MGR")  # no user
    subject_emp = _make_employee(org, dept, "EMP", manager_emp=manager_emp)
    assert DirectManagerResolver().resolve(subject_emp, request=None) is None


@pytest.mark.django_db
def test_department_head_resolver_returns_head_user(org: Organization, dept: Department) -> None:
    head_user = _make_user(org, email="head@x.com")
    head_emp = _make_employee(org, dept, "HEAD", user=head_user)
    dept.head_employee_id = head_emp.id
    dept.save()
    subject_emp = _make_employee(org, dept, "EMP")
    found = DepartmentHeadResolver().resolve(subject_emp, request=None)
    assert found is not None and found.id == head_user.id


@pytest.mark.django_db
def test_department_head_resolver_none_when_no_head(org: Organization, dept: Department) -> None:
    subject_emp = _make_employee(org, dept, "EMP")
    assert DepartmentHeadResolver().resolve(subject_emp, request=None) is None


@pytest.mark.django_db
def test_role_resolver_returns_first_user_with_role(org: Organization, dept: Department) -> None:
    finance_user = _make_user(org, email="fin@x.com")
    role = Role.objects.create(org_id=org.id, code="finance", name="Finance", is_system=True)
    UserRole.objects.create(user=finance_user, role=role, granted_by=None)
    subject_emp = _make_employee(org, dept, "EMP")
    found = RoleResolver("finance").resolve(subject_emp, request=None)
    assert found is not None and found.id == finance_user.id


@pytest.mark.django_db
def test_role_resolver_none_when_no_user_holds_role(org: Organization, dept: Department) -> None:
    subject_emp = _make_employee(org, dept, "EMP")
    assert RoleResolver("nonexistent").resolve(subject_emp, request=None) is None


@pytest.mark.django_db
def test_finance_resolver_is_role_finance_alias(org: Organization, dept: Department) -> None:
    finance_user = _make_user(org, email="fin@x.com")
    role = Role.objects.create(org_id=org.id, code="finance", name="Finance", is_system=True)
    UserRole.objects.create(user=finance_user, role=role, granted_by=None)
    subject_emp = _make_employee(org, dept, "EMP")
    found = FinanceResolver().resolve(subject_emp, request=None)
    assert found is not None and found.id == finance_user.id


@pytest.mark.django_db
def test_role_resolver_scopes_by_org(org: Organization, dept: Department) -> None:
    """A finance user in another org must NOT be returned for this org's subject."""
    other_org = Organization.objects.create(
        name="Y",
        slug="y",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    other_finance_user = _make_user(other_org, email="other-fin@x.com")
    other_role = Role.objects.create(
        org_id=other_org.id, code="finance", name="Finance", is_system=True
    )
    UserRole.objects.create(user=other_finance_user, role=other_role, granted_by=None)

    subject_emp = _make_employee(org, dept, "EMP")
    found = FinanceResolver().resolve(subject_emp, request=None)
    assert found is None  # only same-org finance users are eligible


# --- FallbackResolver -------------------------------------------------------


@pytest.mark.django_db
def test_fallback_returns_first_non_none(org: Organization, dept: Department) -> None:
    """First resolver wins when it returns a user."""
    manager_user = _make_user(org, email="mgr@x.com")
    manager_emp = _make_employee(org, dept, "MGR", user=manager_user)
    subject_emp = _make_employee(org, dept, "EMP", manager_emp=manager_emp)

    resolver = FallbackResolver(DirectManagerResolver(), DepartmentHeadResolver())
    found = resolver.resolve(subject_emp, request=None)
    assert found is not None and found.id == manager_user.id


@pytest.mark.django_db
def test_fallback_falls_through_to_department_head(
    org: Organization,
    dept: Department,
) -> None:
    """When direct manager is None, fallback uses department head."""
    head_user = _make_user(org, email="head@x.com")
    head_emp = _make_employee(org, dept, "HEAD", user=head_user)
    dept.head_employee_id = head_emp.id
    dept.save()
    subject_emp = _make_employee(org, dept, "EMP")  # no manager

    resolver = FallbackResolver(DirectManagerResolver(), DepartmentHeadResolver())
    found = resolver.resolve(subject_emp, request=None)
    assert found is not None and found.id == head_user.id


@pytest.mark.django_db
def test_fallback_falls_through_to_role(org: Organization, dept: Department) -> None:
    """No manager + no department head → falls through to RoleResolver."""
    hr_user = _make_user(org, email="hr@x.com")
    role = Role.objects.create(
        org_id=org.id,
        code="hr_manager",
        name="HR",
        is_system=True,
    )
    UserRole.objects.create(user=hr_user, role=role, granted_by=None)
    subject_emp = _make_employee(org, dept, "EMP")  # no manager, no dept head

    resolver = FallbackResolver(
        DirectManagerResolver(),
        DepartmentHeadResolver(),
        RoleResolver("hr_manager"),
    )
    found = resolver.resolve(subject_emp, request=None)
    assert found is not None and found.id == hr_user.id


@pytest.mark.django_db
def test_fallback_returns_none_when_all_fail(
    org: Organization,
    dept: Department,
) -> None:
    """All resolvers return None → fallback returns None (engine raises)."""
    subject_emp = _make_employee(org, dept, "EMP")  # no manager, no dept head, no roles

    resolver = FallbackResolver(
        DirectManagerResolver(),
        DepartmentHeadResolver(),
        RoleResolver("hr_manager"),
    )
    found = resolver.resolve(subject_emp, request=None)
    assert found is None


def test_fallback_rejects_empty_init() -> None:
    """At least one inner resolver is required."""
    with pytest.raises(ValueError):
        FallbackResolver()


# --- Self-approval exclusion (v1.10.1 sweep Bug #2) ------------------------


class _FakeRequest:
    """Stand-in subject used to feed the resolver a `request.employee`."""

    def __init__(self, employee: Employee) -> None:
        self.employee = employee


@pytest.mark.django_db
def test_department_head_resolver_excludes_requester(org: Organization, dept: Department) -> None:
    """If the department head IS the requester, resolver returns None.

    Regression guard for v1.10.1 Bug #2 (the ops.lead case): a solo manager
    whose dept head_employee_id points at themselves must not be assigned
    as their own approver.
    """
    user = _make_user(org, email="solo@x.com")
    emp = _make_employee(org, dept, "SOLO", user=user)
    dept.head_employee_id = emp.id
    dept.save()
    request = _FakeRequest(emp)

    assert DepartmentHeadResolver().resolve(emp, request=request) is None


@pytest.mark.django_db
def test_role_resolver_excludes_requester(org: Organization, dept: Department) -> None:
    """If the only user holding the role IS the requester, return None."""
    user = _make_user(org, email="solo-hr@x.com")
    role = Role.objects.create(org_id=org.id, code="hr_manager", name="HR", is_system=True)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    emp = _make_employee(org, dept, "SOLO", user=user)
    request = _FakeRequest(emp)

    assert RoleResolver("hr_manager").resolve(emp, request=request) is None


@pytest.mark.django_db
def test_role_resolver_picks_other_user_when_requester_also_holds_role(
    org: Organization, dept: Department
) -> None:
    """Requester holding the role does not block another user from being picked."""
    requester_user = _make_user(org, email="req@x.com")
    other_user = _make_user(org, email="other@x.com")
    role = Role.objects.create(org_id=org.id, code="hr_manager", name="HR", is_system=True)
    UserRole.objects.create(user=requester_user, role=role, granted_by=None)
    UserRole.objects.create(user=other_user, role=role, granted_by=None)
    requester_emp = _make_employee(org, dept, "REQ", user=requester_user)
    request = _FakeRequest(requester_emp)

    found = RoleResolver("hr_manager").resolve(requester_emp, request=request)
    assert found is not None
    assert found.id == other_user.id


@pytest.mark.django_db
def test_fallback_skips_requester_through_chain(org: Organization, dept: Department) -> None:
    """End-to-end: solo manager + dept head=self + sole hr_manager=self → None.

    With the inner resolvers self-aware, the fallback no longer paints the
    requester as their own approver. Engine then raises NoApproverFound,
    which is the correct error surface for "everyone in the chain is the
    requester themselves".
    """
    user = _make_user(org, email="solo@x.com")
    role = Role.objects.create(org_id=org.id, code="hr_manager", name="HR", is_system=True)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    emp = _make_employee(org, dept, "SOLO", user=user)
    dept.head_employee_id = emp.id
    dept.save()
    request = _FakeRequest(emp)

    resolver = FallbackResolver(
        DirectManagerResolver(),
        DepartmentHeadResolver(),
        RoleResolver("hr_manager"),
    )
    assert resolver.resolve(emp, request=request) is None


@pytest.mark.django_db
def test_resolvers_no_op_when_request_lacks_employee(org: Organization, dept: Department) -> None:
    """Back-compat: tests/services that pass request=None must keep working."""
    user = _make_user(org, email="head@x.com")
    head_emp = _make_employee(org, dept, "HEAD", user=user)
    dept.head_employee_id = head_emp.id
    dept.save()
    subject_emp = _make_employee(org, dept, "EMP")
    found = DepartmentHeadResolver().resolve(subject_emp, request=None)
    assert found is not None and found.id == user.id
