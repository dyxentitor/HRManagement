"""Tests for GET /api/v1/leave/entitlement-preview/."""

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.leave.models import LeaveType
from modules.organization.models import Organization

pytestmark = pytest.mark.django_db


@pytest.fixture
def org(db):
    return Organization.objects.create(
        name="TestOrg",
        slug="testorg",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def _make_user_with_perms(org, email, perm_codes):
    user = User.objects.create_user(
        email=email,
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(org_id=org.id, code=email.split("@")[0], name=email, is_system=False)
    for code in perm_codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    return user


@pytest.fixture
def api_client_admin(org):
    user = _make_user_with_perms(
        org,
        "hradmin@test.com",
        ["leave:balance:adjust:org"],
    )
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def api_client_employee(org):
    user = _make_user_with_perms(
        org,
        "employee@test.com",
        ["leave:request:read:self"],
    )
    c = APIClient()
    c.force_authenticate(user)
    return c


def test_preview_lists_only_accrual_types_with_numbers(api_client_admin, org):
    LeaveType.all_objects.create(
        org_id=org.id, code="ANNUAL", name="Annual", default_days=Decimal("8"), accrual_type="annual"
    )
    LeaveType.all_objects.create(
        org_id=org.id,
        code="MATERNITY",
        name="Maternity",
        default_days=Decimal("98"),
        accrual_type="event_based",
    )
    r = api_client_admin.get("/api/v1/leave/entitlement-preview/?hire_date=2026-07-01")
    assert r.status_code == 200
    codes = {i["code"] for i in r.json()["items"]}
    assert codes == {"ANNUAL"}
    annual = next(i for i in r.json()["items"] if i["code"] == "ANNUAL")
    assert Decimal(str(annual["days_per_year"])) == Decimal("8")
    assert Decimal(str(annual["prorated_days"])) == Decimal("4.00")  # July hire


def test_preview_requires_perm(api_client_employee):
    r = api_client_employee.get("/api/v1/leave/entitlement-preview/?hire_date=2026-07-01")
    assert r.status_code == 403


def test_preview_400_without_hire_date(api_client_admin):
    assert api_client_admin.get("/api/v1/leave/entitlement-preview/").status_code == 400


def test_preview_excludes_soft_deleted_leave_type(api_client_admin, org):
    from django.utils import timezone

    lt = LeaveType.all_objects.create(
        org_id=org.id,
        code="ANNUAL_DELETED",
        name="Annual (soft-deleted)",
        default_days=Decimal("8"),
        accrual_type="annual",
    )
    lt.deleted_at = timezone.now()
    lt.save()

    r = api_client_admin.get("/api/v1/leave/entitlement-preview/?hire_date=2026-07-01")
    assert r.status_code == 200
    codes = {i["code"] for i in r.json()["items"]}
    assert "ANNUAL_DELETED" not in codes
