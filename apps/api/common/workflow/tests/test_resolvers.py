"""Resolvers: turn (subject_employee, request) into the user that should approve."""

import datetime
import os

import pytest
from cryptography.fernet import Fernet

from common.workflow.resolvers import (
    DepartmentHeadResolver,
    DirectManagerResolver,
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
