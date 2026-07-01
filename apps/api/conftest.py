"""pytest fixtures shared across all tests."""

import pytest


@pytest.fixture(autouse=True)
def _test_env(tmp_path, settings, monkeypatch):
    """Per-test isolation: uploads go to a tmp dir, and API rate-limiting is off.

    DRF binds throttle rates as a *class attribute at import time*, so overriding
    them via settings at runtime doesn't take effect. Patch the throttle directly
    so login/MFA/password tests (and any fixture that logs in repeatedly) never
    hit 429. The cache is left intact so perm-cache tests still work.
    """
    settings.MEDIA_ROOT = tmp_path / "media"

    from rest_framework.throttling import SimpleRateThrottle

    monkeypatch.setattr(SimpleRateThrottle, "allow_request", lambda self, request, view: True)
