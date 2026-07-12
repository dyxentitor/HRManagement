import pytest
from django.core.management import call_command

from modules.identity.models import Permission, Role, RolePermission
from modules.organization.models import Organization

pytestmark = pytest.mark.django_db


@pytest.fixture
def org():
    return Organization.objects.create(
        name="Test Org",
        slug="test-org-perms",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


def test_feedback_perms_seed_and_grant(org):
    call_command("seed_permission_catalogue")
    for code in ("feedback:submit:self", "feedback:read:self", "feedback:manage:org"):
        assert Permission.objects.filter(code=code).exists()
    call_command("seed_default_roles", "--org-id", str(org.id))
    call_command("grant_default_perms", "--org-id", str(org.id))
    admin = Role.objects.get(org_id=org.id, code="org_admin")
    emp = Role.objects.get(org_id=org.id, code="employee")

    def has(role, code):
        return RolePermission.objects.filter(role=role, permission__code=code).exists()

    assert has(admin, "feedback:manage:org") and has(admin, "feedback:submit:self")
    assert has(emp, "feedback:submit:self") and has(emp, "feedback:read:self")
    assert not has(emp, "feedback:manage:org")
