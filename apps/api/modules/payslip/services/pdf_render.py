"""Render a payslip to PDF bytes.

Primary renderer: ReportLab (portable, no system deps).
WeasyPrint support retained behind HAS_WEASYPRINT guard for container use
when cairo/pango are available.
"""

from __future__ import annotations

import io

try:
    from weasyprint import HTML

    HAS_WEASYPRINT = True
except ImportError:
    HAS_WEASYPRINT = False

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    HAS_REPORTLAB = True
except ImportError:  # pragma: no cover
    HAS_REPORTLAB = False


def _render_with_reportlab(*, payslip, employee, org) -> bytes:
    """Render payslip to PDF bytes using ReportLab."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=2 * cm, bottomMargin=2 * cm)
    styles = getSampleStyleSheet()
    story = []

    # Header
    story.append(Paragraph("Payslip", styles["Title"]))
    story.append(Spacer(1, 0.3 * cm))
    story.append(
        Paragraph(
            f"<b>{employee.first_name} {employee.last_name}</b>"
            f" ({employee.employee_code}) — {org.name}",
            styles["Normal"],
        )
    )
    story.append(
        Paragraph(
            f"Period: {payslip.period.period_start} to {payslip.period.period_end}"
            f" | Pay date: {payslip.period.pay_date}",
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 0.5 * cm))

    currency = payslip.currency_code

    # Earnings table
    earn_data = [["Earnings", f"Amount ({currency})"]]
    for code, amount in (payslip.components or {}).items():
        earn_data.append([code, str(amount)])
    earn_data.append(["Gross", str(payslip.gross)])
    earn_table = Table(earn_data, colWidths=[12 * cm, 5 * cm])
    earn_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ]
        )
    )
    story.append(earn_table)
    story.append(Spacer(1, 0.4 * cm))

    # Deductions table
    ded_data = [["Deductions", f"Amount ({currency})"]]
    for code, amount in (payslip.deductions or {}).items():
        ded_data.append([code, str(amount)])
    ded_table = Table(ded_data, colWidths=[12 * cm, 5 * cm])
    ded_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ]
        )
    )
    story.append(ded_table)
    story.append(Spacer(1, 0.4 * cm))

    # Net pay
    net_data = [["Net Pay", str(payslip.net)]]
    net_table = Table(net_data, colWidths=[12 * cm, 5 * cm])
    net_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 14),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ]
        )
    )
    story.append(net_table)

    doc.build(story)
    return buf.getvalue()


def render_payslip_pdf(*, payslip, employee, org) -> bytes:
    """Returns PDF bytes for the given payslip + employee + org."""
    if HAS_REPORTLAB:
        return _render_with_reportlab(payslip=payslip, employee=employee, org=org)

    if HAS_WEASYPRINT:  # pragma: no cover - WeasyPrint path (container only)
        from django.template.loader import render_to_string

        html = render_to_string(
            "payslip.html",
            {
                "payslip": payslip,
                "period": payslip.period,
                "employee": employee,
                "org": org,
                "components": payslip.components,
                "deductions": payslip.deductions,
                "gross": payslip.gross,
                "net": payslip.net,
                "currency": payslip.currency_code,
            },
        )
        return HTML(string=html).write_pdf()

    # Last resort fallback — neither lib available
    return b"%PDF-1.4 fallback"  # pragma: no cover
