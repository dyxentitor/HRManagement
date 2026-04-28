from .csv_exporter import CSVExporter
from .pdf_exporter import PDFExporter
from .xlsx_exporter import XLSXExporter

EXPORTERS = {
    "csv": CSVExporter(),
    "xlsx": XLSXExporter(),
    "pdf": PDFExporter(),
}


def get_exporter(format: str):
    e = EXPORTERS.get(format)
    if e is None:
        raise ValueError(f"Unknown export format: {format}")
    return e
