"""v1.11.0 — `user:create` permission code + default-role grants."""

import pytest
from django.core.management import call_command

from modules.identity.models import Permission, Role
from modules.organization.models import Organization


@pytest.mark.django_db
def test_user_create_permission_seeded():
    call_command("seed_permission_catalogue")
    assert Permission.objects.filter(code="user:create").exists()


@pytest.mark.django_db
def test_permission_catalogue_total_is_126():
    call_command("seed_permission_catalogue")
    # 111 (v1.11.0) + 6 dashboard perms (v1.12.0) + 3 assignment perms (v1.33.0)
    # + 2 email-config perms (org:email_config:read/write)
    # + 1 claim:approve:override (v1.57.0)
    assert Permission.objects.count() == 126


@pytest.mark.django_db
def test_org_admin_and_hr_manager_get_user_create():
    call_command("seed_permission_catalogue")
    org = Organization.objects.create(
        name="T",
        slug="t",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    call_command("seed_default_roles", "--org-id", str(org.id))
    for code in ("org_admin", "hr_manager"):
        role = Role.objects.get(org_id=org.id, code=code)
        assert role.permissions.filter(code="user:create").exists()
