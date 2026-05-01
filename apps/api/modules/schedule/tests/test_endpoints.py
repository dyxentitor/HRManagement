"""Integration tests for /api/v1/schedule/* endpoints."""

import datetime
import os

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization
from modules.schedule.models import Shift


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


def _login(client: APIClient, email: str, password: str = "x") -> str:  # pragma: allowlist secret
    body = client.post(
        "/api/v1/auth/login", {"email": email, "password": password}, format="json"
    ).json()
    return body["access_token"]


@pytest.fixture
def stack():
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")

    mgr_user = User.objects.create_user(
        email="m@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    emp_user = User.objects.create_user(
        email="e@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret

    mgr_role = Role.objects.create(org_id=org.id, code="manager", name="Manager", is_system=True)
    emp_role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)

    mgr_codes = [
        "schedule:work-schedule:read",
        "schedule:shift:read",
        "schedule:shift:write",
        "schedule:assignment:read:team",
        "schedule:assignment:write:team",
        "schedule:assignment:publish:team",
        "schedule:holiday:read",
    ]
    emp_codes = [
        "schedule:shift:read",
        "schedule:assignment:read:self",
        "schedule:holiday:read",
    ]
    for code in mgr_codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=mgr_role, permission=p)
    for code in emp_codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=emp_role, permission=p)

    UserRole.objects.create(user=mgr_user, role=mgr_role, granted_by=None)
    UserRole.objects.create(user=emp_user, role=emp_role, granted_by=None)

    def _emp(code, user, manager=None):
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

    mgr_emp = _emp("MGR", mgr_user)
    emp_emp = _emp("EMP", emp_user, manager=mgr_emp)

    mgr_client = APIClient()
    mgr_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(mgr_client, 'm@x.com')}")
    emp_client = APIClient()
    emp_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(emp_client, 'e@x.com')}")

    return org, dept, emp_emp, mgr_client, emp_client


@pytest.mark.django_db
def test_list_shifts_authenticated(stack) -> None:
    org, _, _, mgr_client, _ = stack
    Shift.all_objects.create(
        org_id=org.id,
        name="Morning",
        code="M",
        start_time=datetime.time(6, 0),
        end_time=datetime.time(14, 0),
        crosses_midnight=False,
    )
    resp = mgr_client.get("/api/v1/schedule/shifts/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_create_shift_as_manager(stack) -> None:
    _, _, _, mgr_client, _ = stack
    resp = mgr_client.post(
        "/api/v1/schedule/shifts/",
        {
            "name": "Day",
            "start_time": "09:00:00",
            "end_time": "18:00:00",
            "crosses_midnight": False,
            "color": "#FF0000",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content


@pytest.mark.django_db
def test_employee_cannot_create_shift(stack) -> None:
    _, _, _, _, emp_client = stack
    resp = emp_client.post(
        "/api/v1/schedule/shifts/",
        {
            "name": "x",
            "start_time": "09:00:00",
            "end_time": "18:00:00",
            "crosses_midnight": False,
        },
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_bulk_assign_pattern(stack) -> None:
    org, _, emp_emp, mgr_client, _ = stack
    s = Shift.all_objects.create(
        org_id=org.id,
        name="Morning",
        code="M",
        start_time=datetime.time(6, 0),
        end_time=datetime.time(14, 0),
        crosses_midnight=False,
    )
    resp = mgr_client.post(
        "/api/v1/schedule/shift-assignments/bulk-pattern/",
        {
            "employee_ids": [str(emp_emp.id)],
            "pattern": {
                "mon": str(s.id),
                "tue": str(s.id),
                "wed": str(s.id),
                "thu": str(s.id),
                "fri": str(s.id),
            },
            "date_from": "2026-06-01",
            "date_to": "2026-06-07",
        },
        format="json",
    )
    assert resp.status_code == 201
    assert resp.json()["created"] == 5  # Mon-Fri only


@pytest.mark.django_db
def test_publish_roster(stack) -> None:
    org, _, emp_emp, mgr_client, _ = stack
    s = Shift.all_objects.create(
        org_id=org.id,
        name="X",
        code="X",
        start_time=datetime.time(9, 0),
        end_time=datetime.time(18, 0),
        crosses_midnight=False,
    )
    mgr_client.post(
        "/api/v1/schedule/shift-assignments/bulk-pattern/",
        {
            "employee_ids": [str(emp_emp.id)],
            "pattern": {"mon": str(s.id)},
            "date_from": "2026-06-01",
            "date_to": "2026-06-07",
        },
        format="json",
    )
    resp = mgr_client.post(
        "/api/v1/schedule/shift-assignments/publish/",
        {"date_from": "2026-06-01", "date_to": "2026-06-07"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["published"] >= 1


@pytest.mark.django_db
def test_my_assignments(stack) -> None:
    org, _, emp_emp, mgr_client, emp_client = stack
    # Mgr creates AND publishes an assignment for the employee
    s = Shift.all_objects.create(
        org_id=org.id,
        name="X",
        code="X",
        start_time=datetime.time(9, 0),
        end_time=datetime.time(18, 0),
        crosses_midnight=False,
    )
    mgr_client.post(
        "/api/v1/schedule/shift-assignments/bulk-pattern/",
        {
            "employee_ids": [str(emp_emp.id)],
            "pattern": {"mon": str(s.id)},
            "date_from": "2026-06-01",
            "date_to": "2026-06-07",
        },
        format="json",
    )
    mgr_client.post(
        "/api/v1/schedule/shift-assignments/publish/",
        {"date_from": "2026-06-01", "date_to": "2026-06-07"},
        format="json",
    )
    # emp_role already has schedule:assignment:read:self in emp_codes
    resp = emp_client.get("/api/v1/schedule/shift-assignments/me/")
    # 200 with the published Mon assignment
    assert resp.status_code == 200, resp.content
