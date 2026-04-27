"""Tests for the TenantContext middleware."""

import uuid

import pytest
from django.test import RequestFactory
from rest_framework.test import APIClient

from common.managers import get_current_org_id
from modules.identity.middleware import TenantContextMiddleware
from modules.identity.models import User


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def user(org_id: uuid.UUID) -> User:
    return User.objects.create_user(
        email="t@example.com",
        password="x",
        org_id=org_id,  # pragma: allowlist secret
    )


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.mark.django_db
def test_middleware_sets_org_id_from_authenticated_user(rf: RequestFactory, user: User) -> None:
    captured: dict = {}

    def get_response(request):
        captured["org_id"] = get_current_org_id()
        return None

    middleware = TenantContextMiddleware(get_response)
    request = rf.get("/foo")
    request.user = user
    middleware(request)
    assert captured["org_id"] == user.org_id


@pytest.mark.django_db
def test_middleware_clears_after_request(rf: RequestFactory, user: User) -> None:
    middleware = TenantContextMiddleware(lambda r: None)
    request = rf.get("/foo")
    request.user = user
    middleware(request)
    assert get_current_org_id() is None


@pytest.mark.django_db
def test_middleware_no_org_for_anonymous(rf: RequestFactory) -> None:
    from django.contrib.auth.models import AnonymousUser

    captured: dict = {}

    def get_response(request):
        captured["org_id"] = get_current_org_id()
        return None

    middleware = TenantContextMiddleware(get_response)
    request = rf.get("/foo")
    request.user = AnonymousUser()
    middleware(request)
    assert captured["org_id"] is None


@pytest.mark.django_db
def test_authenticated_request_can_query_tenant_scoped_models(
    client: APIClient, user: User
) -> None:
    """Integration: after login, GET /api/v1/auth/me works and org context is set."""
    login = client.post(
        "/api/v1/auth/login",
        {"email": "t@example.com", "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    me = client.get(
        "/api/v1/auth/me",
        HTTP_AUTHORIZATION=f"Bearer {login['access_token']}",
    )
    assert me.status_code == 200
    assert me.json()["org_id"] == str(user.org_id)
