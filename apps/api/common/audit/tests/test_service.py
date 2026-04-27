"""audit.append + middleware-captured actor/ip/ua thread-local."""

import uuid
from unittest.mock import Mock

import pytest
from django.test import RequestFactory

from common.audit import append
from common.audit.middleware import AuditContextMiddleware
from common.audit.models import AuditLog
from modules.identity.models import User


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def user(org_id: uuid.UUID) -> User:
    return User.objects.create_user(
        email="auditor@example.com",
        password="x",
        org_id=org_id,  # pragma: allowlist secret
    )


@pytest.mark.django_db
def test_append_writes_audit_row(user: User) -> None:
    """Without middleware context, actor is None but the row still writes."""
    entity_id = uuid.uuid4()
    append(
        org_id=user.org_id,
        action="user.password.change",
        entity="users",
        entity_id=entity_id,
        before={"hash": "old"},
        after={"hash": "new"},
    )
    rows = AuditLog.objects.filter(entity_id=entity_id)
    assert rows.count() == 1
    assert rows[0].action == "user.password.change"
    assert rows[0].actor_id is None


@pytest.mark.django_db
def test_middleware_captures_actor_in_audit_row(rf: RequestFactory, user: User) -> None:
    """When the middleware is active, append picks up actor_id/ip/user_agent automatically."""
    captured = {}

    def get_response(request):
        # Inside the request lifecycle, `append` should see the actor
        entity_id = uuid.uuid4()
        captured["entity_id"] = entity_id
        append(
            org_id=user.org_id,
            action="something",
            entity="things",
            entity_id=entity_id,
            before=None,
            after={"x": 1},
        )
        return Mock()

    middleware = AuditContextMiddleware(get_response)
    request = rf.get("/foo", HTTP_USER_AGENT="pytest-ua")
    request.user = user
    request.META["REMOTE_ADDR"] = "10.0.0.1"
    middleware(request)

    row = AuditLog.objects.get(entity_id=captured["entity_id"])
    assert row.actor_id == user.id
    assert row.ip == "10.0.0.1"
    assert row.user_agent == "pytest-ua"
