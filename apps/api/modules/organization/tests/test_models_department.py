"""Department model tests."""

import pytest

from common.managers import clear_current_org_id, set_current_org_id
from modules.organization.models import Department, Organization


@pytest.fixture
def org() -> Organization:
    return Organization.objects.create(
        name="Provintell",
        slug="provintell",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.mark.django_db
def test_department_create(org: Organization) -> None:
    d = Department.all_objects.create(org_id=org.id, name="Operations")
    assert d.org_id == org.id
    assert d.parent_id is None
    assert d.head_employee_id is None


@pytest.mark.django_db
def test_department_tree_via_parent(org: Organization) -> None:
    parent = Department.all_objects.create(org_id=org.id, name="Operations")
    child = Department.all_objects.create(org_id=org.id, name="SOC L1", parent=parent)
    assert child.parent_id == parent.id


@pytest.mark.django_db
def test_department_unique_name_within_parent(org: Organization) -> None:
    parent = Department.all_objects.create(org_id=org.id, name="Engineering")
    Department.all_objects.create(org_id=org.id, name="Backend", parent=parent)
    with pytest.raises(Exception):
        Department.all_objects.create(org_id=org.id, name="Backend", parent=parent)


@pytest.mark.django_db
def test_department_tenantscoped_filtered_by_context(org: Organization) -> None:
    other = Organization.objects.create(
        name="Other",
        slug="other",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    Department.all_objects.create(org_id=org.id, name="Provintell-Ops")
    Department.all_objects.create(org_id=other.id, name="Other-Ops")

    set_current_org_id(org.id)
    try:
        names = list(Department.objects.values_list("name", flat=True))
    finally:
        clear_current_org_id()
    assert names == ["Provintell-Ops"]
