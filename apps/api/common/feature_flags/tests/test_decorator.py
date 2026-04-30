"""Tests for @requires_feature(key) class decorator."""

import pytest
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.viewsets import ViewSet

from common.feature_flags.decorators import requires_feature
from common.feature_flags.models import FeatureFlag
from modules.identity.models import User
from modules.organization.models import Organization


@pytest.fixture
def org():
    return Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def user(org):
    return User.objects.create_user(
        email="u@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret


@requires_feature("claims")
class _DummyClaimsViewSet(ViewSet):
    def list(self, request):
        return Response({"ok": True})


@requires_feature("identity")
class _DummyIdentityViewSet(ViewSet):
    def list(self, request):
        return Response({"ok": True})


def _call_list(viewset_cls, user):
    factory = APIRequestFactory()
    request = factory.get("/dummy/")
    force_authenticate(request, user=user)
    view = viewset_cls.as_view({"get": "list"})
    return view(request)


@pytest.mark.django_db
def test_decorator_passes_when_module_enabled(user):
    resp = _call_list(_DummyClaimsViewSet, user)
    assert resp.status_code == 200


@pytest.mark.django_db
def test_decorator_blocks_when_module_disabled(org, user):
    FeatureFlag.objects.create(org_id=org.id, key="claims", enabled=False)
    resp = _call_list(_DummyClaimsViewSet, user)
    assert resp.status_code == 403
    assert "claims" in resp.data["detail"].lower()


@pytest.mark.django_db
def test_decorator_passes_for_critical_even_if_db_says_false(org, user):
    """Defense in depth: identity is critical and stays on regardless of DB."""
    FeatureFlag.objects.create(org_id=org.id, key="identity", enabled=False)
    resp = _call_list(_DummyIdentityViewSet, user)
    assert resp.status_code == 200


@pytest.mark.django_db
def test_decorator_invalidates_cache_when_flag_flips(org, user):
    """If we flip via set_enabled (which invalidates the cache), the next request reflects it."""
    from common.feature_flags.services import set_enabled

    resp = _call_list(_DummyClaimsViewSet, user)
    assert resp.status_code == 200
    set_enabled(org.id, "claims", False, actor=user)
    resp = _call_list(_DummyClaimsViewSet, user)
    assert resp.status_code == 403
