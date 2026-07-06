import uuid

import pytest

from modules.identity.models import Role, User, UserRole
from modules.notification.services.recipients import (
    active_employee_users,
    hr_manager_users,
)


@pytest.mark.django_db
def test_hr_manager_users_scoped_to_org():
    org = uuid.uuid4()
    other = uuid.uuid4()
    hr = User.objects.create_user(
        email="hr@x.com", password="x", org_id=org  # pragma: allowlist secret
    )
    role = Role.objects.create(org_id=org, code="hr_manager", name="HR", is_system=True)
    UserRole.objects.create(user=hr, role=role, granted_by=None)
    # a different-org hr_manager must not leak in
    hr2 = User.objects.create_user(
        email="hr@y.com", password="x", org_id=other  # pragma: allowlist secret
    )
    role2 = Role.objects.create(org_id=other, code="hr_manager", name="HR", is_system=True)
    UserRole.objects.create(user=hr2, role=role2, granted_by=None)
    ids = set(hr_manager_users(org).values_list("id", flat=True))
    assert ids == {hr.id}


@pytest.mark.django_db
def test_active_employee_users_excludes_inactive():
    org = uuid.uuid4()
    a = User.objects.create_user(
        email="a@x.com", password="x", org_id=org  # pragma: allowlist secret
    )
    b = User.objects.create_user(
        email="b@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org,
        is_active=False,
    )
    ids = set(active_employee_users(org).values_list("id", flat=True))
    assert a.id in ids and b.id not in ids


@pytest.mark.django_db
def test_new_preference_types_registered():
    from modules.notification.services.preferences import DEFAULT_PREFERENCES

    codes = {t[0] for t in DEFAULT_PREFERENCES}
    for c in [
        "announcement.published",
        "payslip.published",
        "user.role_changed",
        "onboarding.activated",
        "incentive.claim_submitted",
    ]:
        assert c in codes
