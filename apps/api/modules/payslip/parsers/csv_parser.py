"""Generic CSV row parser with per-row error reporting."""

from __future__ import annotations

import csv
import io


def parse_csv(text: str) -> tuple[list[dict], list[dict]]:
    """Returns (rows, errors). Each row is a dict; each error is {row: int, error: str}."""
    rows: list[dict] = []
    errors: list[dict] = []
    reader = csv.DictReader(io.StringIO(text))
    for i, row in enumerate(reader, start=2):  # row 1 is header
        clean = {
            k: (v or "").strip() if isinstance(v, str) else ""
            for k, v in row.items()
            if k is not None  # DictReader puts overflow values under None key
        }
        rows.append({"_row": i, **clean})
    return rows, errors
