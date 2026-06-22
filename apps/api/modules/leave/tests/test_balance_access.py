"""Per-employee leave-balance read scopes + HR manual adjustment (v1.28.0)."""

import datetime
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.leave.models import LeaveBalance, LeaveBalanceLedger, LeaveType
from modules.leave.services.balance import BalanceService
from modules.organization.models import Department, Organization


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


def _emp(org, dept, code, user, manager=None):
    return Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=code,
        first_name=code,
        last_name="x",
        email=f"{code.lower()}@x.com",
        department=dept,
        manager=manager,
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
    )


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def stack(db):
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    lt = LeaveType.all_objects.create(
        org_id=org.id, code="ANNUAL", name="Annual", accrual_type="annual",
        default_days=Decimal("14"), is_paid=True, is_statutory=True, gender_restriction="any",
    )

    users = {k: User.objects.create_user(email=f"{k}@x.com", password="x", org_id=org.id)
             for k in ("emp", "mgr", "hr", "other")}
    roles = {
        "emp": ("employee", ["leave:balance:read:self"]),
        "mgr": ("manager", ["leave:balance:read:self", "leave:balance:read:team"]),
        "hr": ("hr", ["leave:balance:read:org", "leave:balance:adjust:org"]),
        "other": ("employee2", ["leave:balance:read:self"]),
    }
    for k, (code, perms) in roles.items():
        r = Role.objects.create(org_id=org.id, code=code, name=code, is_system=False)
        _grant(r, *perms)
        UserRole.objects.create(user=users[k], role=r)

    mgr_emp = _emp(org, dept, "MGR", users["mgr"])
    emp_emp = _emp(org, dept, "EMP", users["emp"], manager=mgr_emp)
    other_emp = _emp(org, dept, "OTHER", users["other"])  # not mgr's report
    _emp(org, dept, "HR", users["hr"])

    BalanceService.accrue(
        org_id=org.id, employee_id=emp_emp.id, leave_type=lt, year=2026,
        days=Decimal("14"), reason="accrual",
    )
    return {
        "org": org, "lt": lt, "emp_emp": emp_emp, "other_emp": other_emp,
        "c": {k: _client(u) for k, u in users.items()},
    }


def _bal_url(emp_id):
    return f"/api/v1/leave/balances/?employee={emp_id}"


def test_employee_reads_own_balance(stack):
    r = stack["c"]["emp"].get(_bal_url(stack["emp_emp"].id))
    assert r.status_code == 200, r.content


def test_employee_cannot_read_another(stack):
    assert stack["c"]["emp"].get(_bal_url(stack["other_emp"].id)).status_code == 403


def test_manager_reads_direct_report(stack):
    assert stack["c"]["mgr"].get(_bal_url(stack["emp_emp"].id)).status_code == 200


def test_manager_cannot_read_non_report(stack):
    assert stack["c"]["mgr"].get(_bal_url(stack["other_emp"].id)).status_code == 403


def test_hr_reads_anyone(stack):
    assert stack["c"]["hr"].get(_bal_url(stack["other_emp"].id)).status_code == 200


def test_hr_adjusts_balance_posts_ledger_and_audit(stack):
    emp_id = stack["emp_emp"].id
    body = {"employee_id": str(emp_id), "leave_type_id": str(stack["lt"].id),
            "delta": "2", "note": "goodwill day"}
    r = stack["c"]["hr"].post("/api/v1/leave/balances/adjust/", body, format="json")
    assert r.status_code == 200, r.content
    bal = LeaveBalance.all_objects.get(employee_id=emp_id, leave_type=stack["lt"], year=2026)
    assert bal.accrued == Decimal("16")  # 14 + 2
    assert LeaveBalanceLedger.objects.filter(
        employee_id=emp_id, reason="manual_adjustment", delta=Decimal("2")
    ).exists()


def test_hr_negative_adjustment(stack):
    emp_id = stack["emp_emp"].id
    r = stack["c"]["hr"].post(
        "/api/v1/leave/balances/adjust/",
        {"employee_id": str(emp_id), "leave_type_id": str(stack["lt"].id),
         "delta": "-3", "note": "correction"},
        format="json",
    )
    assert r.status_code == 200, r.content
    bal = LeaveBalance.all_objects.get(employee_id=emp_id, leave_type=stack["lt"], year=2026)
    assert bal.accrued == Decimal("11")  # 14 - 3


def test_employee_cannot_adjust(stack):
    r = stack["c"]["emp"].post(
        "/api/v1/leave/balances/adjust/",
        {"employee_id": str(stack["emp_emp"].id), "leave_type_id": str(stack["lt"].id),
         "delta": "2", "note": "x"},
        format="json",
    )
    assert r.status_code == 403


def test_zero_delta_rejected(stack):
    r = stack["c"]["hr"].post(
        "/api/v1/leave/balances/adjust/",
        {"employee_id": str(stack["emp_emp"].id), "leave_type_id": str(stack["lt"].id),
         "delta": "0", "note": "x"},
        format="json",
    )
    assert r.status_code == 400
