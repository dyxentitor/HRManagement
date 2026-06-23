import pytest
from django.core.management import call_command

from modules.identity.models import Permission, Role
from modules.organization.models import Organization


@pytest.mark.django_db
def test_assignment_perms_seeded_to_roles():
    call_command("seed_permission_catalogue")
    for c in ("assignment:create:org", "assignment:create:team", "assignment:read:org"):
        assert Permission.objects.filter(code=c).exists()
    o = Organization.objects.create(
        name="X",
        slug="x-perm",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    call_command("seed_default_roles", "--org-id", str(o.id))
    admin = Role.objects.get(org_id=o.id, code="org_admin")
    assert admin.permissions.filter(code="assignment:create:org").exists()
    assert admin.permissions.filter(code="assignment:read:org").exists()
    mgr = Role.objects.get(org_id=o.id, code="manager")
    assert mgr.permissions.filter(code="assignment:create:team").exists()
    tl = Role.objects.get(org_id=o.id, code="team_lead")
    assert tl.permissions.filter(code="assignment:create:team").exists()
