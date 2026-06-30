"""Service-layer tests for feature flags."""

import pytest

from common.feature_flags.exceptions import CriticalModuleError, UnknownModuleKeyError
from common.feature_flags.models import FeatureFlag
from common.feature_flags.services import is_enabled, list_for_org, set_enabled
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
def actor(org):
    return User.objects.create_user(
        email="a@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret


@pytest.mark.django_db
def test_is_enabled_default_true_when_no_row(org):
    assert is_enabled(org.id, "claims") is True


@pytest.mark.django_db
def test_is_enabled_respects_db_row(org, actor):
    set_enabled(org.id, "claims", False, actor=actor)
    assert is_enabled(org.id, "claims") is False
    set_enabled(org.id, "claims", True, actor=actor)
    assert is_enabled(org.id, "claims") is True


@pytest.mark.django_db
def test_critical_module_always_enabled_even_if_db_says_false(org):
    """Manually insert a disabled row for `identity` — must still report True."""
    FeatureFlag.objects.create(org_id=org.id, key="identity", enabled=False)
    assert is_enabled(org.id, "identity") is True


@pytest.mark.django_db
def test_dependency_cascade(org, actor):
    """Disabling `schedule` makes `attendance` effectively disabled."""
    set_enabled(org.id, "schedule", False, actor=actor)
    assert is_enabled(org.id, "schedule") is False
    assert is_enabled(org.id, "attendance") is False  # cascade


@pytest.mark.django_db
def test_set_enabled_rejects_critical(org, actor):
    with pytest.raises(CriticalModuleError):
        set_enabled(org.id, "identity", False, actor=actor)


@pytest.mark.django_db
def test_set_enabled_rejects_unknown_key(org, actor):
    with pytest.raises(UnknownModuleKeyError):
        set_enabled(org.id, "ceo_module", False, actor=actor)


@pytest.mark.django_db
def test_set_enabled_writes_audit(org, actor):
    from common.audit.models import AuditLog

    initial = AuditLog.objects.filter(action="feature_flag.changed").count()
    set_enabled(org.id, "claims", False, actor=actor)
    assert AuditLog.objects.filter(action="feature_flag.changed").count() == initial + 1


@pytest.mark.django_db
def test_list_for_org_returns_16_entries(org, actor):
    """10 togglable + 3 critical + 2 derived."""
    set_enabled(org.id, "claims", False, actor=actor)
    entries = list_for_org(org.id)
    assert len(entries) == 16
    by_key = {e["key"]: e for e in entries}
    assert by_key["claims"]["enabled"] is False
    assert by_key["identity"]["critical"] is True
    assert by_key["identity"]["enabled"] is True
    assert by_key["dashboard"]["derived"] is True
    assert by_key["leave"]["enabled"] is True  # default
