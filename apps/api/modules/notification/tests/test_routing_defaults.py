"""A zero-row org must behave exactly as it did before routing existed."""

import uuid

import pytest

from modules.notification.registry import REGISTRY
from modules.notification.services.preferences import SECURITY_TYPES
from modules.notification.services.routing import routing_for

pytestmark = pytest.mark.django_db

ORG = uuid.uuid4()


def _legacy_is_immediate(type_code: str, priority: str) -> bool:
    """The lane rule exactly as it was written in notify() before this feature."""
    return type_code in SECURITY_TYPES or priority in ("urgent", "high")


@pytest.mark.parametrize("priority", ["low", "normal", "high", "urgent"])
def test_auto_delivery_matches_legacy_rule_for_every_type(priority):
    for n in REGISTRY:
        routing = routing_for(ORG, n.type)
        assert routing.is_immediate(priority) is _legacy_is_immediate(n.type, priority), (
            f"{n.type}/{priority} diverged from the pre-routing lane rule"
        )


def test_both_kill_switches_default_open_for_every_type():
    for n in REGISTRY:
        routing = routing_for(ORG, n.type)
        assert routing.in_app_enabled is True
        assert routing.email_enabled is True
        assert routing.channel_enabled("in_app") is True
        assert routing.channel_enabled("email") is True


def test_kill_switch_default_ignores_registry_email_default():
    # leave.cancelled ships email_default=False. That governs the *personal*
    # preference, not the org gate — the gate must still default open.
    routing = routing_for(ORG, "leave.cancelled")
    assert routing.email_enabled is True


def test_defaults_are_not_persisted():
    from modules.notification.models import NotificationRouting

    routing_for(ORG, "leave.approved")
    assert NotificationRouting.objects.count() == 0


def test_routing_for_returns_stored_row_when_present():
    from modules.notification.models import NotificationRouting

    NotificationRouting.objects.create(org_id=ORG, type="leave.approved", delivery="digest")
    routing = routing_for(ORG, "leave.approved")
    assert routing.pk is not None
    assert routing.delivery == "digest"


def test_unknown_type_resolves_to_open_defaults():
    routing = routing_for(ORG, "made.up.type")
    assert routing.channel_enabled("email") is True
    assert routing.is_immediate("normal") is False


def test_explicit_delivery_overrides_auto():
    from modules.notification.models import NotificationRouting

    NotificationRouting.objects.create(org_id=ORG, type="leave.approved", delivery="immediate")
    assert routing_for(ORG, "leave.approved").is_immediate("normal") is True

    NotificationRouting.objects.filter(org_id=ORG, type="leave.approved").update(delivery="digest")
    assert routing_for(ORG, "leave.approved").is_immediate("urgent") is False


def test_non_empty_cc_forces_immediate_under_auto():
    from modules.notification.models import NotificationRouting

    NotificationRouting.objects.create(
        org_id=ORG, type="leave.approved", delivery="auto", cc_entries=["hr@provintell.com"]
    )
    assert routing_for(ORG, "leave.approved").is_immediate("normal") is True


def test_security_type_email_stays_enabled_against_a_persisted_off_row():
    """The override must beat a stored value, not just the field default."""
    from modules.notification.models import NotificationRouting

    NotificationRouting.objects.create(
        org_id=ORG, type="auth.password_changed", email_enabled=False
    )
    routing = routing_for(ORG, "auth.password_changed")
    assert routing.email_enabled is False  # the stored value is untouched
    assert routing.channel_enabled("email") is True  # ...and the override wins


def test_non_security_type_honours_a_persisted_off_row():
    """Contrast case: without the security override, the stored value governs."""
    from modules.notification.models import NotificationRouting

    NotificationRouting.objects.create(org_id=ORG, type="leave.approved", email_enabled=False)
    assert routing_for(ORG, "leave.approved").channel_enabled("email") is False
