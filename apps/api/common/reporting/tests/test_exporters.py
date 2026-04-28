"""Exporter tests — verify each format produces non-empty bytes."""

import pytest

from common.reporting.exporters import get_exporter

COLUMNS = [{"field": "name", "label": "Name"}, {"field": "amount", "label": "Amount"}]
ROWS = [{"name": "Alice", "amount": "100"}, {"name": "Bob", "amount": "250"}]


def test_csv_exporter():
    e = get_exporter("csv")
    out = e.render(title="Test", columns=COLUMNS, rows=ROWS)
    assert b"Alice,100" in out
    assert b"Bob,250" in out


def test_xlsx_exporter_returns_zip_bytes():
    e = get_exporter("xlsx")
    out = e.render(title="Test", columns=COLUMNS, rows=ROWS)
    assert out.startswith(b"PK")  # XLSX is a ZIP


def test_pdf_exporter_returns_pdf_bytes():
    e = get_exporter("pdf")
    out = e.render(title="Test", columns=COLUMNS, rows=ROWS)
    assert out.startswith(b"%PDF")


def test_unknown_format_raises():
    with pytest.raises(ValueError):
        get_exporter("unknown")
