"""Exporter base."""

from abc import ABC, abstractmethod
from collections.abc import Iterable
from typing import Any


class Exporter(ABC):
    format: str
    content_type: str

    @abstractmethod
    def render(
        self,
        *,
        title: str,
        columns: list[dict[str, Any]],
        rows: Iterable[dict[str, Any]],
    ) -> bytes: ...
