"""Tests for the compact OrgNode serializer."""

import datetime
import os

import pytest
from cryptography.fernet import Fernet

from modules.employee.models import Employee
from modules.employee.serializers_org_chart import OrgNodeSerializer, OrgSearchHitSerializer
from modules.employee.services import org_chart
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY", Fernet.generate_key().decode()
        )  # pragma: allowlist secret


def _emp(org, dept, code, manager=None, first=""):
    return Employee.all_objects.create(
        org_id=org.id,
        employee_code=code,
        first_name=first or code,
        last_name="Doe",
        email=f"{code.lower()}@x.com",
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
        manager=manager,
        role_title="Chief",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )


@pytest.fixture
def org():
    return Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.mark.django_db
def test_node_shape(org):
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    ceo = _emp(org, dept, "CEO", first="Jane")
    _emp(org, dept, "VP", manager=ceo)
    node = OrgNodeSerializer(org_chart.roots_qs(org.id).first()).data
    assert node["full_name"] == "Jane Doe"
    assert node["email"] == "ceo@x.com"
    assert node["role_title"] == "Chief"
    assert node["department_name"] == "Eng"
    assert node["direct_reports_count"] == 1
    assert node["has_reports"] is True
    assert node["manager_name"] is None
    assert node["photo_url"] is None
    assert node["hire_date"] == "2024-01-01"


@pytest.mark.django_db
def test_manager_name_populated(org):
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    ceo = _emp(org, dept, "CEO", first="Jane")
    vp = _emp(org, dept, "VP", manager=ceo, first="Sam")
    node = OrgNodeSerializer(org_chart.children_qs(org.id, ceo.id).get(pk=vp.id)).data
    assert node["manager_name"] == "Jane Doe"
    assert node["has_reports"] is False


@pytest.mark.django_db
def test_search_hit_includes_ancestor_ids(org):
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    ceo = _emp(org, dept, "CEO", first="Jane")
    vp = _emp(org, dept, "VP", manager=ceo, first="Sam")
    vp.ancestor_ids = [str(ceo.id)]
    node = OrgSearchHitSerializer(vp).data
    assert node["ancestor_ids"] == [str(ceo.id)]
