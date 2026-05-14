"""Tests for the centralised S3 client factories."""

from __future__ import annotations

import pytest

from common.storage.s3 import bucket, internal_s3_client, public_s3_client


@pytest.fixture
def s3_env(monkeypatch):
    monkeypatch.setenv("S3_ENDPOINT_URL", "http://minio:9000")
    monkeypatch.setenv("S3_ACCESS_KEY", "test-key")
    monkeypatch.setenv("S3_SECRET_KEY", "test-secret")  # pragma: allowlist secret
    monkeypatch.setenv("S3_BUCKET", "test-bucket")


def test_internal_client_uses_internal_endpoint(s3_env):
    client = internal_s3_client()
    assert client.meta.endpoint_url == "http://minio:9000"


def test_public_client_falls_back_to_internal_when_public_unset(s3_env, monkeypatch):
    monkeypatch.delenv("S3_PUBLIC_ENDPOINT_URL", raising=False)
    client = public_s3_client()
    assert client.meta.endpoint_url == "http://minio:9000"


def test_public_client_uses_public_endpoint_when_set(s3_env, monkeypatch):
    monkeypatch.setenv("S3_PUBLIC_ENDPOINT_URL", "http://localhost:9000")
    client = public_s3_client()
    assert client.meta.endpoint_url == "http://localhost:9000"


def test_presigned_url_uses_public_endpoint(s3_env, monkeypatch):
    """Critical regression: presigned URLs must NOT embed the Docker hostname.

    This is the exact failure mode from the v1.10.0 Playwright sweep, Bug #1:
    the browser receives ``http://minio:9000/...`` and DNS-fails.
    """
    monkeypatch.setenv("S3_PUBLIC_ENDPOINT_URL", "http://localhost:9000")
    url = public_s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket(), "Key": "some/key.png"},
        ExpiresIn=300,
    )
    assert url.startswith("http://localhost:9000/")
    assert "minio:9000" not in url


def test_bucket_reads_env(monkeypatch):
    monkeypatch.setenv("S3_BUCKET", "custom-bucket")
    assert bucket() == "custom-bucket"


def test_bucket_defaults_to_hrms(monkeypatch):
    monkeypatch.delenv("S3_BUCKET", raising=False)
    assert bucket() == "hrms"
