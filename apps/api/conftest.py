"""pytest fixtures shared across all tests."""
import pytest


@pytest.fixture(autouse=True)
def _media_root(tmp_path, settings):
    """Isolate file uploads to a tmp dir per test."""
    settings.MEDIA_ROOT = tmp_path / "media"
