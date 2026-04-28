"""Registry tests — no DB needed."""

from typing import ClassVar

import pytest

from common.reporting.registry import REGISTRY, Report, register


def test_register_adds_to_registry():
    @register
    class _R(Report):
        code = "_test.r1"
        title = "Test 1"
        columns: ClassVar[list] = [{"field": "id", "label": "ID"}]

        @classmethod
        def queryset(cls, *, filters, user):
            return []

    assert "_test.r1" in REGISTRY
    REGISTRY.pop("_test.r1")


def test_register_rejects_duplicate():
    @register
    class _A(Report):
        code = "_test.dup"
        title = "A"
        columns: ClassVar[list] = []

        @classmethod
        def queryset(cls, *, filters, user):
            return []

    with pytest.raises(ValueError):

        @register
        class _B(Report):
            code = "_test.dup"
            title = "B"
            columns: ClassVar[list] = []

            @classmethod
            def queryset(cls, *, filters, user):
                return []

    REGISTRY.pop("_test.dup")


def test_register_requires_code():
    with pytest.raises(ValueError):

        @register
        class _NoCode(Report):
            code = ""
            title = "x"
            columns: ClassVar[list] = []

            @classmethod
            def queryset(cls, *, filters, user):
                return []


def test_schema_returns_metadata():
    @register
    class _R(Report):
        code = "_test.schema"
        title = "Schema"
        columns: ClassVar[list] = [{"field": "x", "label": "X"}]
        filters: ClassVar[list] = [{"field": "y", "type": "date"}]
        exporters: ClassVar[list] = ["csv", "xlsx"]

        @classmethod
        def queryset(cls, *, filters, user):
            return []

    s = _R.schema()
    assert s["code"] == "_test.schema"
    assert s["columns"] == [{"field": "x", "label": "X"}]
    assert "xlsx" in s["exporters"]
    REGISTRY.pop("_test.schema")
