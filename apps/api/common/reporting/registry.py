"""Report registry — base class + @register decorator."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, ClassVar

from django.db.models import QuerySet

REGISTRY: dict[str, type[Report]] = {}


def register(cls: type[Report]) -> type[Report]:
    """Decorator: register a Report subclass."""
    if not getattr(cls, "code", None):
        raise ValueError(f"{cls.__name__} missing 'code'")
    if cls.code in REGISTRY:
        raise ValueError(f"Report code already registered: {cls.code}")
    REGISTRY[cls.code] = cls
    return cls


class Report(ABC):
    code: ClassVar[str]
    title: ClassVar[str]
    permissions: ClassVar[list[str]] = []
    columns: ClassVar[list[dict[str, Any]]] = []  # [{field, label, type?}, ...]
    filters: ClassVar[list[dict[str, Any]]] = []  # [{field, type, label, options?, source?}, ...]
    exporters: ClassVar[list[str]] = ["csv"]  # subset of {"csv", "xlsx", "pdf"}

    @classmethod
    def schema(cls) -> dict[str, Any]:
        return {
            "code": cls.code,
            "title": cls.title,
            "columns": cls.columns,
            "filters": cls.filters,
            "exporters": cls.exporters,
            "permissions": cls.permissions,
        }

    @classmethod
    def is_visible_for(cls, user) -> bool:
        from modules.identity.services.permissions import get_user_perms

        if not cls.permissions:
            return True
        perms = get_user_perms(user)
        return all(p in perms for p in cls.permissions)

    @classmethod
    @abstractmethod
    def queryset(cls, *, filters: dict, user) -> QuerySet | list[dict]:
        """Return the data — either a QuerySet (auto-serialized via columns)
        or a pre-serialized list of dicts.
        """
        ...

    @classmethod
    def serialize_row(cls, row: Any) -> dict[str, Any]:
        """Default: read each column field from row (model instance or dict)."""
        if isinstance(row, dict):
            return {c["field"]: row.get(c["field"]) for c in cls.columns}
        out: dict[str, Any] = {}
        for c in cls.columns:
            value = row
            for part in c["field"].split("."):
                if value is None:
                    break
                value = getattr(value, part, None)
            out[c["field"]] = str(value) if value is not None else None
        return out
