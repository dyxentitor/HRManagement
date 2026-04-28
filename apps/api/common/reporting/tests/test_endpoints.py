"""Reporting endpoint integration tests."""

from __future__ import annotations

import os
from typing import ClassVar
from unittest.mock import MagicMock, patch

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from common.reporting.registry import REGISTRY, Report, register
from modules.identity.models import Permission, Role, RolePermission, User
from modules.organization.models import Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY",
            Fernet.generate_key().decode(),  # pragma: allowlist secret
        )


@pytest.fixture(autouse=True)
def _test_report():
    """Register a lightweight test report and clean up after."""

    @register
    class _TestReport(Report):
        code = "_ep_test.simple"
        title = "Endpoint test report"
        permissions: ClassVar[list] = ["report:list", "report:run"]
        columns: ClassVar[list] = [{"field": "val", "label": "Value"}]
        filters: ClassVar[list] = [{"field": "val", "type": "text", "label": "Value filter"}]
        exporters: ClassVar[list] = ["csv"]

        @classmethod
        def queryset(cls, *, filters: dict, user):
            return [{"val": "row1"}, {"val": "row2"}]

    yield _TestReport
    REGISTRY.pop("_ep_test.simple", None)


@pytest.fixture
def stack():
    org = Organization.objects.create(
        name="ReportOrg",
        slug="reportorg",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    user = User.objects.create_user(
        email="reporter@x.com",
        password="pass",  # pragma: allowlist secret
        org_id=org.id,
    )
    role = Role.objects.create(org_id=org.id, code="hr_manager", name="HR", is_system=True)
    for code in [
        "report:list",
        "report:run",
        "report:export",
        "report:saved_view:write",
    ]:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    from modules.identity.models import UserRole

    UserRole.objects.create(user=user, role=role)
    return {"org": org, "user": user}


def _auth(client: APIClient, email: str, password: str = "pass") -> str:  # pragma: allowlist secret
    body = client.post(
        "/api/v1/auth/login", {"email": email, "password": password}, format="json"
    ).json()
    return body["access_token"]


@pytest.mark.django_db
def test_report_list_returns_registered_reports(stack):
    client = APIClient()
    token = _auth(client, "reporter@x.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.get("/api/v1/reports")
    assert resp.status_code == 200
    codes = [r["code"] for r in resp.json()]
    assert "_ep_test.simple" in codes


@pytest.mark.django_db
def test_report_schema_returns_metadata(stack):
    client = APIClient()
    token = _auth(client, "reporter@x.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.get("/api/v1/reports/_ep_test.simple/schema")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == "_ep_test.simple"
    assert data["columns"] == [{"field": "val", "label": "Value"}]


@pytest.mark.django_db
def test_report_run_returns_paginated_rows(stack):
    client = APIClient()
    token = _auth(client, "reporter@x.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.post(
        "/api/v1/reports/_ep_test.simple/run", {"filters": {}, "page": 1}, format="json"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["rows"]) == 2
    assert data["rows"][0] == {"val": "row1"}


@pytest.mark.django_db
def test_report_run_404_unknown_code(stack):
    client = APIClient()
    token = _auth(client, "reporter@x.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = client.post("/api/v1/reports/no.such.code/run", {"filters": {}}, format="json")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_report_export_creates_job(stack):
    client = APIClient()
    token = _auth(client, "reporter@x.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    with patch("common.reporting.tasks.run_export") as mock_task:
        mock_task.delay = MagicMock()
        resp = client.post(
            "/api/v1/reports/_ep_test.simple/export",
            {"filters": {}, "format": "csv"},
            format="json",
        )
    assert resp.status_code == 202
    assert "job_id" in resp.json()


@pytest.mark.django_db
def test_saved_views_crud(stack):
    client = APIClient()
    token = _auth(client, "reporter@x.com")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    # Create
    resp = client.post(
        "/api/v1/reports/saved-views",
        {"report_code": "_ep_test.simple", "name": "My view", "filters": {"val": "x"}},
        format="json",
    )
    assert resp.status_code == 201
    sv_id = resp.json()["id"]

    # List
    resp = client.get("/api/v1/reports/saved-views?code=_ep_test.simple")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # Delete
    resp = client.delete(f"/api/v1/reports/saved-views/{sv_id}")
    assert resp.status_code == 204
