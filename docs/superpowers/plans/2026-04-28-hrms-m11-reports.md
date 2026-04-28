# HRMS M11 — Reports (Registry + 15 reports + Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generic Report registry: each report = a Python class with `code`, `title`, `columns`, `filters`, `queryset_fn`, `exporters`, `permissions`. Each module's `reports.py` registers its reports via a `@register` decorator. Single frontend page introspects the registry and renders filters + table + export buttons. 15 reports registered (12 standard + 3 HR-ops per spec §5b).

**Architecture:**
- New package: `apps/api/common/reporting/`
- Module-side: each contributing module gets a `reports.py` that imports `register` and decorates Report subclasses.
- Frontend: one generic `ReportRunPage` that calls `/reports/{code}/schema` to learn filters/columns, then renders + lets user filter + page through results + export.
- Exporters: CSV (sync), XLSX/PDF (async via Celery → S3, frontend polls job).

**Spec reference:** spec §5b (15-report list), §4 (`/reports/*` endpoints).

**Branch:** `m11/reports` from master.

---

## File structure

```
apps/api/common/reporting/                     NEW
├── __init__.py
├── apps.py
├── models.py                                   SavedView, ReportExportJob
├── registry.py                                 Report base + @register + REGISTRY
├── exporters/
│   ├── __init__.py
│   ├── base.py
│   ├── csv_exporter.py
│   ├── xlsx_exporter.py                        openpyxl
│   └── pdf_exporter.py                         ReportLab (already a dep from M6)
├── tasks.py                                    Celery: run_export
├── serializers.py
├── views.py
├── urls.py
├── migrations/
└── tests/

apps/api/modules/<each>/reports.py              NEW per contributing module
                                                 (leave, attendance, claims, kpi, certification, employee)

apps/api/pyproject.toml                         + openpyxl

apps/web/src/modules/reports/                   NEW
├── api.ts, routes.tsx
└── pages/{ReportsListPage, ReportRunPage}.tsx
```

---

## Task 1: Branch + reporting framework + 2 models + permissions

**Files:**
- Create: `apps/api/common/reporting/{__init__.py, apps.py, models.py, registry.py, migrations/__init__.py, tests/__init__.py, tests/test_registry.py}`
- Modify: `apps/api/hrms_api/settings/base.py`
- Modify: `apps/api/pyproject.toml` (+ openpyxl)
- Create: `apps/api/modules/identity/fixtures/permissions_m11.yaml`

- [ ] **Step 1: Branch + skeleton + dep**

```
git checkout master
git checkout -b m11/reports
mkdir -p apps/api/common/reporting/{exporters,tests,migrations}
touch apps/api/common/reporting/__init__.py \
      apps/api/common/reporting/exporters/__init__.py \
      apps/api/common/reporting/migrations/__init__.py \
      apps/api/common/reporting/tests/__init__.py
```

Add `"openpyxl>=3.1,<4.0"` to `apps/api/pyproject.toml`. `cd apps/api && uv sync`.

- [ ] **Step 2: Models**

```python
# common/reporting/models.py
"""Reporting infrastructure models — saved views + export jobs."""
from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.utils import timezone


JOB_STATUSES: ClassVar[tuple] = (
    ("pending", "Pending"), ("running", "Running"),
    ("done", "Done"), ("failed", "Failed"),
)


class SavedView(models.Model):
    """User × report-code × filter combo."""
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey("identity.User", on_delete=models.CASCADE, related_name="saved_views")
    report_code = models.CharField(max_length=64)
    name = models.CharField(max_length=128)
    filters = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "report_saved_view"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["user", "report_code", "name"],
                name="saved_view_unique_user_report_name",
            ),
        ]
        indexes: ClassVar[list] = [models.Index(fields=["user", "report_code"])]


class ReportExportJob(models.Model):
    """Async export job tracking."""
    id = models.BigAutoField(primary_key=True)
    org_id = models.UUIDField(db_index=True)
    user = models.ForeignKey("identity.User", on_delete=models.CASCADE, related_name="report_jobs")
    report_code = models.CharField(max_length=64)
    filters = models.JSONField(default=dict)
    format = models.CharField(max_length=8)  # csv|xlsx|pdf
    status = models.CharField(max_length=8, choices=JOB_STATUSES, default="pending")
    s3_key = models.CharField(max_length=500, blank=True)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "report_export_job"
        indexes: ClassVar[list] = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["status"]),
        ]
```

- [ ] **Step 3: Registry + base Report**

```python
# common/reporting/registry.py
"""Report registry — base class + @register decorator."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, ClassVar

from django.db.models import QuerySet


REGISTRY: dict[str, type["Report"]] = {}


def register(cls: type["Report"]) -> type["Report"]:
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
    columns: ClassVar[list[dict[str, Any]]] = []      # [{field, label, type?}, ...]
    filters: ClassVar[list[dict[str, Any]]] = []      # [{field, type, label, options?, source?}, ...]
    exporters: ClassVar[list[str]] = ["csv"]          # subset of {"csv", "xlsx", "pdf"}

    @classmethod
    def schema(cls) -> dict[str, Any]:
        return {
            "code": cls.code, "title": cls.title,
            "columns": cls.columns, "filters": cls.filters,
            "exporters": cls.exporters, "permissions": cls.permissions,
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
```

- [ ] **Step 4: Permission codes**

`permissions_m11.yaml`:

```yaml
- { code: "report:list",            description: List available reports }
- { code: "report:run",             description: Run a report (server-side render) }
- { code: "report:export",          description: Export a report (CSV/XLSX/PDF) }
- { code: "report:saved_view:write", description: Save / delete own report views }
```

(4 codes — threshold ≥ 105.)

Update default_roles: all roles get `report:list`, `report:run`, `report:saved_view:write`. `report:export` gated to manager+/finance+/hr+. Auditor gets all read.

- [ ] **Step 5: Tests**

`tests/test_registry.py`:

```python
"""Registry tests."""
import pytest

from common.reporting.registry import REGISTRY, Report, register


def test_register_adds_to_registry():
    @register
    class _R(Report):
        code = "_test.r1"
        title = "Test 1"
        columns = [{"field": "id", "label": "ID"}]
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
        columns = []
        @classmethod
        def queryset(cls, *, filters, user): return []
    with pytest.raises(ValueError):
        @register
        class _B(Report):
            code = "_test.dup"
            title = "B"
            columns = []
            @classmethod
            def queryset(cls, *, filters, user): return []
    REGISTRY.pop("_test.dup")


def test_register_requires_code():
    with pytest.raises(ValueError):
        @register
        class _NoCode(Report):
            code = ""
            title = "x"
            columns = []
            @classmethod
            def queryset(cls, *, filters, user): return []


def test_schema_returns_metadata():
    @register
    class _R(Report):
        code = "_test.schema"
        title = "Schema"
        columns = [{"field": "x", "label": "X"}]
        filters = [{"field": "y", "type": "date"}]
        exporters = ["csv", "xlsx"]
        @classmethod
        def queryset(cls, *, filters, user): return []
    s = _R.schema()
    assert s["code"] == "_test.schema"
    assert s["columns"] == [{"field": "x", "label": "X"}]
    assert "xlsx" in s["exporters"]
    REGISTRY.pop("_test.schema")
```

(4 tests, no DB needed.)

- [ ] **Step 6: Generate migration + commit**

```
cd apps/api && uv run python manage.py makemigrations reporting 2>&1 | tail -5 && uv run pytest common/reporting/tests/ -v 2>&1 | tail -10; cd ../..
```

```
git add apps/api/common/reporting/ apps/api/pyproject.toml apps/api/uv.lock \
        apps/api/hrms_api/settings/base.py \
        apps/api/modules/identity/fixtures/ apps/api/modules/identity/tests/test_seed_commands.py
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(reporting): registry + Report base + SavedView/ExportJob models + M11 perms"
```

---

## Task 2: Exporters + Celery export task

**Files:**
- Create: `apps/api/common/reporting/exporters/{base.py, csv_exporter.py, xlsx_exporter.py, pdf_exporter.py}`
- Create: `apps/api/common/reporting/tasks.py`
- Create: `apps/api/common/reporting/tests/test_exporters.py`

- [ ] **Step 1: Exporter base + 3 implementations**

`exporters/base.py`:

```python
"""Exporter base."""
from abc import ABC, abstractmethod
from typing import Any, Iterable


class Exporter(ABC):
    format: str
    content_type: str

    @abstractmethod
    def render(
        self, *,
        title: str, columns: list[dict[str, Any]], rows: Iterable[dict[str, Any]],
    ) -> bytes:
        ...
```

`csv_exporter.py`:

```python
import csv
import io
from typing import Any, Iterable

from .base import Exporter


class CSVExporter(Exporter):
    format = "csv"
    content_type = "text/csv"

    def render(self, *, title, columns, rows) -> bytes:
        buf = io.StringIO()
        fieldnames = [c["field"] for c in columns]
        writer = csv.DictWriter(buf, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})
        return buf.getvalue().encode("utf-8")
```

`xlsx_exporter.py`:

```python
import io
from typing import Any, Iterable

from openpyxl import Workbook

from .base import Exporter


class XLSXExporter(Exporter):
    format = "xlsx"
    content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    def render(self, *, title, columns, rows) -> bytes:
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
```

`pdf_exporter.py`:

```python
import io
from typing import Any, Iterable

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)

from .base import Exporter


class PDFExporter(Exporter):
    format = "pdf"
    content_type = "application/pdf"

    def render(self, *, title, columns, rows) -> bytes:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=landscape(A4))
        styles = getSampleStyleSheet()
        story = [Paragraph(title, styles["Title"]), Spacer(1, 12)]

        header = [c.get("label") or c["field"] for c in columns]
        data = [header]
        for row in rows:
            data.append([str(row.get(c["field"], "")) for c in columns])

        table = Table(data, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dddddd")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
        ]))
        story.append(table)
        doc.build(story)
        return buf.getvalue()
```

`exporters/__init__.py`:

```python
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
```

- [ ] **Step 2: Celery task**

`tasks.py`:

```python
"""Async export task."""
from __future__ import annotations

import os
import uuid

import boto3
from botocore.config import Config
from celery import shared_task
from django.utils import timezone


def _s3():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY"),
        aws_secret_access_key=os.environ.get("S3_SECRET_KEY"),
        region_name=os.environ.get("S3_REGION", "us-east-1"),
        config=Config(signature_version="s3v4"),
    )


@shared_task
def run_export(job_id: int):
    """Run a report export job: query → render → upload to S3 → update job row."""
    from modules.identity.models import User

    from .exporters import get_exporter
    from .models import ReportExportJob
    from .registry import REGISTRY

    job = ReportExportJob.objects.get(id=job_id)
    job.status = "running"
    job.save(update_fields=["status"])

    try:
        cls = REGISTRY.get(job.report_code)
        if cls is None:
            raise ValueError(f"Unknown report: {job.report_code}")

        rows_qs = cls.queryset(filters=job.filters, user=job.user)
        rows = [cls.serialize_row(r) for r in rows_qs]

        exporter = get_exporter(job.format)
        content = exporter.render(title=cls.title, columns=cls.columns, rows=rows)

        s3_key = f"reports/{job.org_id}/{job.report_code}/{uuid.uuid4()}.{job.format}"
        _s3().put_object(
            Bucket=os.environ.get("S3_BUCKET", "hrms"),
            Key=s3_key, Body=content, ContentType=exporter.content_type,
        )

        job.s3_key = s3_key
        job.status = "done"
        job.completed_at = timezone.now()
        job.save(update_fields=["s3_key", "status", "completed_at"])
    except Exception as exc:
        job.status = "failed"
        job.error = str(exc)[:1000]
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "error", "completed_at"])
        raise
```

- [ ] **Step 3: Tests**

`tests/test_exporters.py`:

```python
"""Exporter tests — verify each format produces non-empty bytes with the right header/MIME."""
import pytest

from common.reporting.exporters import EXPORTERS, get_exporter


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
```

- [ ] **Step 4: Commit**

```
git add apps/api/common/reporting/
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(reporting): CSV/XLSX/PDF exporters + Celery run_export task"
```

---

## Task 3: Endpoints + register first 5 reports

**Files:**
- Create: `apps/api/common/reporting/{serializers.py, views.py, urls.py, tests/test_endpoints.py}`
- Create: `apps/api/modules/leave/reports.py` (3 reports)
- Create: `apps/api/modules/attendance/reports.py` (3 reports — but only register 2 for this task; leave 1 for Task 4)

For now, register 5 reports: 3 leave + 2 attendance. The other 10 land in Task 4.

- [ ] **Step 1: Endpoints**

```
GET    /api/v1/reports                            list visible reports for user
GET    /api/v1/reports/{code}/schema              filter spec for UI
POST   /api/v1/reports/{code}/run                 body: {filters, page?, page_size?} → paginated
POST   /api/v1/reports/{code}/export              body: {filters, format} → 202 + job_id
GET    /api/v1/reports/jobs/{job_id}              poll: {status, s3_url?, error?}
GET    /api/v1/reports/saved-views?code=
POST   /api/v1/reports/saved-views                {code, name, filters}
DELETE /api/v1/reports/saved-views/{id}
```

- [ ] **Step 2: Discover reports on app startup**

Edit `common/reporting/apps.py`:

```python
from django.apps import AppConfig


class ReportingConfig(AppConfig):
    name = "common.reporting"
    label = "reporting"
    verbose_name = "Reports"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        # Trigger module-side reports.py imports
        from django.apps import apps
        for app_config in apps.get_app_configs():
            try:
                __import__(f"{app_config.name}.reports")
            except ImportError:
                pass  # Module doesn't have reports.py — fine
```

- [ ] **Step 3: First 5 reports**

`apps/api/modules/leave/reports.py`:

```python
"""Leave module reports."""
from __future__ import annotations

import datetime
from typing import Any

from django.db.models import QuerySet

from common.reporting.registry import Report, register

from .models import LeaveBalance, LeaveRequest


@register
class LeaveBalanceSummary(Report):
    code = "leave.balance_summary"
    title = "Leave balance summary"
    permissions = ["leave:balance:read:org"]
    columns = [
        {"field": "employee_id", "label": "Employee ID"},
        {"field": "leave_type__code", "label": "Type"},
        {"field": "year", "label": "Year"},
        {"field": "entitled", "label": "Entitled"},
        {"field": "accrued", "label": "Accrued"},
        {"field": "taken", "label": "Taken"},
        {"field": "available", "label": "Available"},
    ]
    filters = [
        {"field": "year", "type": "number", "label": "Year"},
        {"field": "leave_type_code", "type": "select", "label": "Leave type"},
    ]
    exporters = ["csv", "xlsx", "pdf"]

    @classmethod
    def queryset(cls, *, filters, user) -> QuerySet:
        qs = LeaveBalance.all_objects.filter(
            org_id=user.org_id, deleted_at__isnull=True,
        ).select_related("leave_type")
        if filters.get("year"):
            qs = qs.filter(year=int(filters["year"]))
        if filters.get("leave_type_code"):
            qs = qs.filter(leave_type__code=filters["leave_type_code"])
        return qs.order_by("employee_id", "leave_type__code", "year")


@register
class LeaveTakenPeriod(Report):
    code = "leave.taken_period"
    title = "Leave taken (period)"
    permissions = ["leave:request:read:org"]
    columns = [
        {"field": "employee_id", "label": "Employee ID"},
        {"field": "leave_type__code", "label": "Type"},
        {"field": "start_date", "label": "Start"},
        {"field": "end_date", "label": "End"},
        {"field": "total_days", "label": "Days"},
        {"field": "status", "label": "Status"},
    ]
    filters = [
        {"field": "date_from", "type": "date", "label": "From"},
        {"field": "date_to", "type": "date", "label": "To"},
    ]
    exporters = ["csv", "xlsx", "pdf"]

    @classmethod
    def queryset(cls, *, filters, user) -> QuerySet:
        qs = LeaveRequest.all_objects.filter(
            org_id=user.org_id, status="approved", deleted_at__isnull=True,
        ).select_related("leave_type")
        if filters.get("date_from"):
            qs = qs.filter(start_date__gte=filters["date_from"])
        if filters.get("date_to"):
            qs = qs.filter(end_date__lte=filters["date_to"])
        return qs.order_by("-start_date")


@register
class LeavePendingApprovals(Report):
    code = "leave.pending_approvals"
    title = "Pending leave approvals"
    permissions = ["leave:request:read:org"]
    columns = [
        {"field": "employee_id", "label": "Employee ID"},
        {"field": "leave_type__code", "label": "Type"},
        {"field": "start_date", "label": "Start"},
        {"field": "total_days", "label": "Days"},
        {"field": "submitted_at", "label": "Submitted"},
    ]
    filters = []
    exporters = ["csv"]

    @classmethod
    def queryset(cls, *, filters, user) -> QuerySet:
        return LeaveRequest.all_objects.filter(
            org_id=user.org_id, status="submitted", deleted_at__isnull=True,
        ).select_related("leave_type").order_by("submitted_at")
```

`apps/api/modules/attendance/reports.py`:

```python
"""Attendance module reports."""
from __future__ import annotations

from common.reporting.registry import Report, register

from .models import AttendanceRecord


@register
class AttendanceDailySummary(Report):
    code = "attendance.daily_summary"
    title = "Daily attendance summary"
    permissions = ["attendance:read:org"]
    columns = [
        {"field": "employee__employee_code", "label": "Employee"},
        {"field": "work_date", "label": "Date"},
        {"field": "clock_in", "label": "Clock in"},
        {"field": "clock_out", "label": "Clock out"},
        {"field": "status", "label": "Status"},
    ]
    filters = [
        {"field": "date", "type": "date", "label": "Date"},
    ]
    exporters = ["csv", "xlsx"]

    @classmethod
    def queryset(cls, *, filters, user):
        qs = AttendanceRecord.all_objects.filter(
            org_id=user.org_id, deleted_at__isnull=True,
        ).select_related("employee")
        if filters.get("date"):
            qs = qs.filter(work_date=filters["date"])
        return qs.order_by("work_date", "employee__employee_code")


@register
class AttendanceLateAbsentLog(Report):
    code = "attendance.late_absent_log"
    title = "Late/absent log"
    permissions = ["attendance:read:org"]
    columns = [
        {"field": "employee__employee_code", "label": "Employee"},
        {"field": "work_date", "label": "Date"},
        {"field": "status", "label": "Status"},
        {"field": "notes", "label": "Notes"},
    ]
    filters = [
        {"field": "date_from", "type": "date", "label": "From"},
        {"field": "date_to", "type": "date", "label": "To"},
    ]
    exporters = ["csv", "xlsx"]

    @classmethod
    def queryset(cls, *, filters, user):
        qs = AttendanceRecord.all_objects.filter(
            org_id=user.org_id, status__in=("late", "absent"), deleted_at__isnull=True,
        ).select_related("employee")
        if filters.get("date_from"):
            qs = qs.filter(work_date__gte=filters["date_from"])
        if filters.get("date_to"):
            qs = qs.filter(work_date__lte=filters["date_to"])
        return qs.order_by("-work_date", "employee__employee_code")
```

- [ ] **Step 4: Endpoints + tests**

`views.py` implements the 7 endpoints. Use `APIView` subclasses (matching the codebase pattern from M10).

`tests/test_endpoints.py`: ~6 tests covering — list returns N reports for user; schema returns metadata; run paginates; export creates job; saved-views CRUD.

- [ ] **Step 5: Mount + commit**

```
git add apps/api/common/reporting/ apps/api/modules/leave/reports.py apps/api/modules/attendance/reports.py apps/api/hrms_api/urls.py
git -c user.email=cyberlab@provintell.com -c user.name="cyberlab" commit -m "feat(reporting): /api/v1/reports/* endpoints + 5 initial reports (leave + attendance)"
```

---

## Task 4: Register remaining 10 reports

**Files:**
- Modify: `apps/api/modules/attendance/reports.py` (add 1 — hours_worked)
- Create: `apps/api/modules/claims/reports.py` (3 reports)
- Create: `apps/api/modules/kpi/reports.py` (1 report)
- Create: `apps/api/modules/certification/reports.py` (1 report)
- Create: `apps/api/modules/employee/reports.py` (1 + 3 HR-ops = 4 reports)

Reports to add (per spec §5b numbering):

- 6: `attendance.hours_worked` (sum hours per employee in period)
- 7: `claims.pending_by_approver`
- 8: `claims.spend_by_category`
- 9: `claims.reimbursement_status`
- 10: `kpi.cycle_progress`
- 11: `cert.expiring_soon`
- 12: `headcount.snapshot`
- HR-ops 1: `hrops.probation_ending` (employees with `probation_end_date` within next N days)
- HR-ops 2: `hrops.contract_ending`
- HR-ops 3: `hrops.birthdays_this_month`

Each ~30 lines following the pattern in Task 3.

Tests: 1-2 smoke tests per report (just verify it runs without error and returns at least the right column names).

Commit: `feat(reporting): register 10 additional reports (claims, kpi, cert, headcount, HR-ops)`

---

## Task 5: Frontend — generic ReportRunPage

**Files:**
- Create: `apps/web/src/modules/reports/{api.ts, routes.tsx, pages/ReportsListPage.tsx, pages/ReportRunPage.tsx}`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/shell/TopBar.tsx` (add "Reports" link)

`ReportsListPage`: fetches `/reports`, lists titles grouped by module-prefix, click → navigate to `/reports/{code}`.

`ReportRunPage`: fetches `/reports/{code}/schema`; renders filters dynamically (date input, select, number, etc.); on submit, calls `/run` and renders the table with column headers from schema. Export buttons trigger `/export` and poll `/jobs/{id}`.

Build, commit: `feat(web): ReportsListPage + generic ReportRunPage with dynamic filters/columns`

---

## Task 6: M11 close

CHANGELOG `[0.1.0-m11] - 2026-04-28`. Tag `v0.1.0-m11`. FF-merge.

---

## M11 Acceptance Criteria

- [ ] All 15 reports registered + visible at `/reports`
- [ ] `/reports/{code}/schema` returns columns + filters + exporters
- [ ] `/reports/{code}/run` returns paginated rows with the right columns
- [ ] CSV export sync; XLSX/PDF export async via Celery task
- [ ] Jobs poll endpoint returns signed S3 URL when done
- [ ] Saved-views CRUD works
- [ ] Permission catalogue ≥ 105
- [ ] All M11 tests green
- [ ] Tag `v0.1.0-m11` on master HEAD; 12 tags total

That closes M11 — only M12 (hardening) left.
