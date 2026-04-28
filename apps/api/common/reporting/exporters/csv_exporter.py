"""CSV exporter."""

import csv
import io
from collections.abc import Iterable
from typing import Any

from .base import Exporter


class CSVExporter(Exporter):
    format = "csv"
    content_type = "text/csv"

    def render(
        self,
        *,
        title: str,
        columns: list[dict[str, Any]],
        rows: Iterable[dict[str, Any]],
    ) -> bytes:
        buf = io.StringIO()
        fieldnames = [c["field"] for c in columns]
        writer = csv.DictWriter(buf, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})
        return buf.getvalue().encode("utf-8")
