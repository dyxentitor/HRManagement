"""XLSX exporter using openpyxl."""

import io
from collections.abc import Iterable
from typing import Any

from openpyxl import Workbook

from .base import Exporter


class XLSXExporter(Exporter):
    format = "xlsx"
    content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    def render(
        self,
        *,
        title: str,
        columns: list[dict[str, Any]],
        rows: Iterable[dict[str, Any]],
    ) -> bytes:
        wb = Workbook()
        ws = wb.active
        ws.title = title[:31]  # Excel sheet name limit
        # Header
        ws.append([c.get("label") or c["field"] for c in columns])
        # Rows
        for row in rows:
            ws.append([row.get(c["field"], "") for c in columns])
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()
