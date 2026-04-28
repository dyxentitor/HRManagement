"""PDF exporter using ReportLab."""

import io
from collections.abc import Iterable
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .base import Exporter


class PDFExporter(Exporter):
    format = "pdf"
    content_type = "application/pdf"

    def render(
        self,
        *,
        title: str,
        columns: list[dict[str, Any]],
        rows: Iterable[dict[str, Any]],
    ) -> bytes:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=landscape(A4))
        styles = getSampleStyleSheet()
        story = [Paragraph(title, styles["Title"]), Spacer(1, 12)]

        header = [c.get("label") or c["field"] for c in columns]
        data = [header]
        for row in rows:
            data.append([str(row.get(c["field"], "")) for c in columns])

        table = Table(data, repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dddddd")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(table)
        doc.build(story)
        return buf.getvalue()
