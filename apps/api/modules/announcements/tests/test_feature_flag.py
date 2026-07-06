
import pytest
from rest_framework.test import APIClient

from common.feature_flags.models import FeatureFlag
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Organization


@pytest.mark.django_db
def test_feed_403_when_flag_disabled():
    org = Organization.objects.create(
        name="P", slug="p", country_code="MY", default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur", default_locale="en-MY",
    )
    FeatureFlag.objects.create(org_id=org.id, key="announcements", enabled=False)
    user = User.objects.create_user(
        email="u@e.com", password="x", org_id=org.id  # pragma: allowlist secret
    )
    role = Role.objects.create(org_id=org.id, code="r", name="R", is_system=True)
    p, _ = Permission.objects.get_or_create(
        code="announcement:read", defaults={"description": ""}
    )
    RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    c = APIClient()
    tok = c.post(
        "/api/v1/auth/login",
        {"email": "u@e.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {tok['access_token']}")
    resp = c.get("/api/v1/announcements/feed/")
    assert resp.status_code == 403
