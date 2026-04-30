class CriticalModuleError(Exception):
    """Raised when an admin tries to disable a critical module."""


class UnknownModuleKeyError(Exception):
    """Raised when set_enabled is called with a key not in the registry."""
