import uuid

import pytest

from modules.announcements.services.audience import resolve_audience
from modules.identity.models import Role, User, UserRole


@pytest.mark.django_db
def test_all_returns_active_users():
    org = uuid.uuid4()
    a = User.objects.create_user(
        email="a@x.com", password="x", org_id=org  # pragma: allowlist secret
    )
    User.objects.create_user(
        email="b@x.com", password="x", org_id=org, is_active=False  # pragma: allowlist secret
    )
    ids = set(resolve_audience(org, "all", []).values_list("id", flat=True))
    assert ids == {a.id}


@pytest.mark.django_db
def test_roles_audience():
    org = uuid.uuid4()
    hr = User.objects.create_user(
        email="hr@x.com", password="x", org_id=org  # pragma: allowlist secret
    )
    role = Role.objects.create(org_id=org, code="hr_manager", name="HR", is_system=True)
    UserRole.objects.create(user=hr, role=role, granted_by=None)
    ids = set(resolve_audience(org, "roles", ["hr_manager"]).values_list("id", flat=True))
    assert ids == {hr.id}
