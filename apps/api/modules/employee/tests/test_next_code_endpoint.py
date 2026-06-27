import datetime as dt

import pytest
from rest_framework.test import APIClient

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


@pytest.mark.django_db
def test_next_code_endpoint_gated_and_scoped():
    org = Organization.objects.create(
        name="X",
        slug="nc",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
        settings={"employee_code_prefix": "PVT"},
    )
    creator = User.objects.create_user(email="hr@x.com", password="x", org_id=org.id)
    role = Role.objects.create(org_id=org.id, code="hr", name="hr", is_system=False)
    _grant(role, "employee:create")
    UserRole.objects.create(user=creator, role=role)
    nobody = User.objects.create_user(email="e@x.com", password="x", org_id=org.id)
    UserRole.objects.create(
        user=nobody,
        role=Role.objects.create(org_id=org.id, code="e", name="e", is_system=False),
    )

    ok = APIClient()
    ok.force_authenticate(creator)
    r = ok.get("/api/v1/employees/next-code/")
    assert r.status_code == 200, r.content
    assert r.json()["code"] == f"PVT-{dt.date.today().year}-0001"

    no = APIClient()
    no.force_authenticate(nobody)
    assert no.get("/api/v1/employees/next-code/").status_code == 403
