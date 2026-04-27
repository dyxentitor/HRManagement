"""CSV import service — fail-soft per row + balanced gross/deductions/net."""

import datetime
import os

import pytest
from cryptography.fernet import Fernet

from modules.employee.models import Employee
from modules.organization.models import Department, Organization
from modules.payslip.models import PayrollPeriod, PayrollRun, PayslipRecord
from modules.payslip.services.csv_import import import_csv


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY",
            Fernet.generate_key().decode(),  # pragma: allowlist secret
        )


@pytest.fixture
def setup():
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")

    def _emp(code):
        return Employee.all_objects.create(
            org_id=org.id,
            employee_code=code,
            first_name=code,
            last_name="x",
            email=f"{code}@x.com",
            phone="+1",
            date_of_birth=datetime.date(1990, 1, 1),
            gender="other",
            nationality="MY",
            marital_status="single",
            address_line1="x",
            city="x",
            state="x",
            postcode="00000",
            country_code="MY",
            department=dept,
            role_title="x",
            employment_type="fulltime",
            hire_date=datetime.date(2024, 1, 1),
            bank_name="x",
            emergency_contact_name="x",
            emergency_contact_relationship="x",
            emergency_contact_phone="+1",
        )

    e1 = _emp("PVT-001")
    e2 = _emp("PVT-002")
    period = PayrollPeriod.all_objects.create(
        org_id=org.id,
        period_start=datetime.date(2026, 6, 1),
        period_end=datetime.date(2026, 6, 30),
        period_type="monthly",
        pay_date=datetime.date(2026, 7, 5),
    )
    run = PayrollRun.all_objects.create(
        org_id=org.id,
        period=period,
        uploaded_by=e1.id,
    )
    return org, period, run, [e1, e2]


def _csv(rows: list[str]) -> str:
    header = "employee_code,gross,net,components_json,deductions_json"
    return "\n".join([header, *rows])


@pytest.mark.django_db
def test_import_valid_csv_creates_payslips(setup):
    _, _, run, _ = setup
    content = _csv(
        [
            'PVT-001,5000.00,4250.00,"{""basic_salary"":5000}","{""epf_employee"":550,""socso_employee"":13.50,""pcb"":186.50}"',
            'PVT-002,3000.00,2750.00,"{""basic_salary"":3000}","{""epf_employee"":250}"',
        ]
    )
    n_imported, errors = import_csv(run=run, csv_text=content)
    assert n_imported == 2
    assert errors == []
    assert PayslipRecord.all_objects.filter(period=run.period).count() == 2


@pytest.mark.django_db
def test_import_unknown_employee_logged_in_errors(setup):
    _, _, run, _ = setup
    content = _csv(
        [
            'GHOST-999,5000.00,4250.00,"{""basic"":5000}","{""epf"":550,""pcb"":200}"',
        ]
    )
    n_imported, errors = import_csv(run=run, csv_text=content)
    assert n_imported == 0
    assert len(errors) == 1
    assert "GHOST-999" in errors[0]["error"]


@pytest.mark.django_db
def test_import_imbalanced_gross_net_logged(setup):
    _, _, run, _ = setup
    # 5000 - (550 + 13.5) = 4436.50, but row says net=9999 (way off)
    content = _csv(
        [
            'PVT-001,5000.00,9999.99,"{""basic"":5000}","{""epf"":550,""socso"":13.50}"',
        ]
    )
    n_imported, errors = import_csv(run=run, csv_text=content)
    assert n_imported == 0
    assert "balance" in errors[0]["error"].lower()


@pytest.mark.django_db
def test_import_partial_success(setup):
    """One good row + one bad row → good row imports, bad row logged."""
    _, _, run, _ = setup
    content = _csv(
        [
            'PVT-001,5000.00,4250.00,"{""basic"":5000}","{""epf"":550,""socso"":13.50,""pcb"":186.50}"',
            'GHOST,1000.00,900.00,"{}","{}"',
        ]
    )
    n_imported, errors = import_csv(run=run, csv_text=content)
    assert n_imported == 1
    assert len(errors) == 1


@pytest.mark.django_db
def test_import_updates_run_state(setup):
    _, _, run, _ = setup
    content = _csv(
        [
            'PVT-001,5000.00,4250.00,"{}","{""epf"":550,""socso"":13.50,""pcb"":186.50}"',
        ]
    )
    import_csv(run=run, csv_text=content)
    run.refresh_from_db()
    assert run.row_count == 1
    assert run.status == "validated"
