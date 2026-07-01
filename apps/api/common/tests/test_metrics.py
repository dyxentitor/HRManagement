"""The Prometheus /metrics endpoint (scraped by the monitoring stack)."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_metrics_endpoint_exposes_prometheus():
    resp = APIClient().get("/metrics")
    assert resp.status_code == 200
    body = resp.content
    # prometheus_client always emits python_info; django-prometheus adds request series.
    assert b"python_info" in body
