import pytest
from django.core.management import call_command

from modules.identity.models import Permission


@pytest.mark.django_db
def test_manage_announcements_permission_label():
    call_command("seed_permission_catalogue")
    p = Permission.objects.get(code="announcement:write")
    assert p.label == "Manage announcements"
    assert Permission.objects.get(code="announcement:read").label == "View announcements"
