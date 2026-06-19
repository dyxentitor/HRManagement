"""PDF render + publish (end-to-end including ledger writes)."""

import datetime
import os
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from cryptography.fernet import Fernet

from common.audit.models import AuditLog, PayrollAuditLedger
from modules.employee.models import Employee
from modules.organization.models import Department, Organization
from modules.payslip.models import PayrollPeriod, PayrollRun, PayslipRecord
from modules.payslip.services.pdf_render import render_payslip_pdf
from modules.payslip.services.publish import publish_run


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
        name="Provintell",
        slug="provintell",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    emp = Employee.all_objects.create(
        org_id=org.id,
        employee_code="PVT-001",
        first_name="Aminah",
        last_name="binti Ali",
        email="a@x.com",
        phone="+1",
        date_of_birth=datetime.date(1990, 1, 1),
        gender="female",
        nationality="MY",
        marital_status="single",
        address_line1="x",
        city="x",
        state="x",
        postcode="00000",
        country_code="MY",
        department=dept,
        role_title="Engineer",
        employment_type="fulltime",
        hire_date=datetime.date(2024, 1, 1),
        bank_name="Maybank",
        emergency_contact_name="x",
        emergency_contact_relationship="x",
        emergency_contact_phone="+1",
    )
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
        uploaded_by=uuid.uuid4(),
        status="validated",
    )
    payslip = PayslipRecord.all_objects.create(
        org_id=org.id,
        employee_id=emp.id,
        period=period,
        gross=Decimal("5000"),
        net=Decimal("4250"),
        currency_code="MYR",
        source="csv_import",
        status="draft",
        components={"basic_salary": "5000"},
        deductions={"epf_employee": "550", "socso_employee": "13.50", "pcb": "186.50"},
    )
    return org, emp, period, run, payslip


@pytest.mark.django_db
def test_render_pdf_returns_bytes(setup):
    org, emp, _, _, payslip = setup
    pdf = render_payslip_pdf(payslip=payslip, employee=emp, org=org)
    assert isinstance(pdf, bytes)
    assert len(pdf) > 100  # at least some content


@pytest.mark.django_db
def test_publish_run_writes_ledger(setup):
    org, _, _, run, _ = setup
    mock_s3 = MagicMock()
    with patch("modules.payslip.services.publish._s3", return_value=mock_s3):
        n = publish_run(run=run, actor_id=uuid.uuid4())
    assert n == 1
    run.refresh_from_db()
    assert run.status == "published"
    assert run.period.status == "completed"
    # Audit log + payroll ledger both have rows
    assert AuditLog.objects.filter(action="payslip.publish").count() == 1
    assert PayrollAuditLedger.objects.filter(action="payslip.publish").count() == 1


@pytest.mark.django_db
def test_publish_already_published_period_rejected(setup):
    org, _, period, run, _ = setup
    period.status = "completed"
    period.save()
    from common.workflow.exceptions import InvalidTransition

    with pytest.raises(InvalidTransition):
        publish_run(run=run, actor_id=uuid.uuid4())


@pytest.mark.django_db
def test_publish_chain_verifies(setup):
    """After publishing, the payroll-ledger hash chain still verifies cleanly."""
    org, _, _, run, _ = setup
    mock_s3 = MagicMock()
    with patch("modules.payslip.services.publish._s3", return_value=mock_s3):
        publish_run(run=run, actor_id=uuid.uuid4())
    from common.audit import verify_payroll_chain

    ok, broken = verify_payroll_chain()
    assert ok is True
    assert broken is None
