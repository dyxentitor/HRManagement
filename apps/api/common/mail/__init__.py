"""Email notification configuration + central mail service."""

__all__ = ["send"]


def __getattr__(name):
    # Lazy re-export so importing this package during app-registry setup does
    # not pull in models before the registry is ready.
    if name == "send":
        from common.mail.service import send

        return send
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
