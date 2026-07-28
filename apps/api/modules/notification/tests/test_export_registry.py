"""Backend test for export_notification_registry command — no DB needed."""

from modules.notification.management.commands.export_notification_registry import _render
from modules.notification.registry import REGISTRY


def test_generated_ts_covers_all_types_and_security():
    ts = _render()
    assert "DO NOT EDIT" in ts
    for n in REGISTRY:
        assert f'"{n.type}"' in ts
    # security set present + includes user.role_changed, excludes a non-security type
    assert '"user.role_changed"' in ts.split("SECURITY_TYPES")[1]
    assert "export const EVENT_LABELS" in ts and "export function getEventLabel" in ts
