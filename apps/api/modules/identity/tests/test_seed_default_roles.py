"""Regression: seed_default_roles must preserve admin edits to existing roles."""

import pytest
from django.core.management import call_command

from modules.identity.models import Permission, Role, RolePermission
from modules.organization.models import Organization


@pytest.fixture
def org():
    return Organization.objects.create(
        name="Acme",
        slug="acme",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.mark.django_db
def test_first_run_creates_roles(org):
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org.id))
    assert Role.objects.filter(org_id=org.id, code="org_admin").exists()
    assert Role.objects.filter(org_id=org.id, code="manager").exists()


@pytest.mark.django_db
def test_re_run_preserves_admin_edits_to_existing_roles(org):
    """Admin removes a perm from `manager`. Re-running the seed must NOT add it back."""
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org.id))

    # Admin removes leave:request:approve:team from manager
    manager = Role.objects.get(org_id=org.id, code="manager")
    perm = Permission.objects.get(code="leave:request:approve:team")
    deleted_count, _ = RolePermission.objects.filter(role=manager, permission=perm).delete()
    assert deleted_count == 1

    # Re-run the seed
    call_command("seed_default_roles", "--org-id", str(org.id))

    # The permission should NOT be back
    still_missing = not RolePermission.objects.filter(role=manager, permission=perm).exists()
    assert still_missing, "seed_default_roles re-added a permission an admin removed"


@pytest.mark.django_db
def test_re_run_does_not_duplicate_permissions(org):
    call_command("seed_permission_catalogue")
    call_command("seed_default_roles", "--org-id", str(org.id))
    initial_count = RolePermission.objects.count()

    call_command("seed_default_roles", "--org-id", str(org.id))
    after_count = RolePermission.objects.count()

    assert initial_count == after_count
