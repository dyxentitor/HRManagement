"""Tests for common.exception_handler — RFC 7807 Problem Details rendering."""

import pytest
from django.urls import path
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.test import APIClient

from common.errors import ProblemDetails


@api_view(["GET"])
def _raise_problem(_request) -> Response:  # pragma: no cover - exercised via test
    raise ProblemDetails(
        type_="https://hrms.example.com/errors/insufficient-balance",
        title="Insufficient leave balance",
        status=422,
        detail="Employee has 2 days available; request is for 3 days.",
        errors=[
            {"field": "total_days", "code": "balance_exceeded", "message": "Available balance: 2.0"}
        ],
    )


urlpatterns = [path("test/raise", _raise_problem)]


@pytest.fixture
def client_with_test_urls(settings) -> APIClient:
    settings.ROOT_URLCONF = __name__
    return APIClient()


@pytest.mark.django_db
def test_problem_details_serializes_to_rfc7807(client_with_test_urls: APIClient) -> None:
    resp = client_with_test_urls.get("/test/raise")
    assert resp.status_code == 422
    assert resp["Content-Type"].startswith("application/problem+json")
    body = resp.json()
    assert body["type"] == "https://hrms.example.com/errors/insufficient-balance"
    assert body["title"] == "Insufficient leave balance"
    assert body["status"] == 422
    assert body["detail"].startswith("Employee has")
    assert body["errors"][0]["field"] == "total_days"
    assert body["errors"][0]["code"] == "balance_exceeded"
