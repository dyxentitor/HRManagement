"""The email-config perm codes exist in the catalogue after seeding."""

import pytest
from django.core.management import call_command

from modules.identity.models import Permission


@pytest.mark.django_db
def test_email_config_perms_seeded():
    call_command("seed_permission_catalogue")
    codes = set(Permission.objects.values_list("code", flat=True))
    assert "org:email_config:read" in codes
    assert "org:email_config:write" in codes
