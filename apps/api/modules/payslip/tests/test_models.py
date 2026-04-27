"""Payroll models — periods, components, payslips, runs."""

import datetime
import os
import uuid
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet
from django.db import IntegrityError

from modules.organization.models import Organization
from modules.payslip.models import (
    PayrollComponent,
    PayrollPeriod,
    PayrollRun,
    PayslipRecord,
)


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch):
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY",
            Fernet.generate_key().decode(),  # pragma: allowlist secret
        )


@pytest.fixture
def org():
    return Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.mark.django_db
def test_period_create(org):
    p = PayrollPeriod.all_objects.create(
        org_id=org.id,
        period_start=datetime.date(2026, 6, 1),
        period_end=datetime.date(2026, 6, 30),
        period_type="monthly",
        pay_date=datetime.date(2026, 7, 5),
    )
    assert p.status == "draft"


@pytest.mark.django_db
def test_period_unique_per_org_dates(org):
    PayrollPeriod.all_objects.create(
        org_id=org.id,
        period_start=datetime.date(2026, 6, 1),
        period_end=datetime.date(2026, 6, 30),
        period_type="monthly",
        pay_date=datetime.date(2026, 7, 5),
    )
    with pytest.raises(IntegrityError):
        PayrollPeriod.all_objects.create(
            org_id=org.id,
            period_start=datetime.date(2026, 6, 1),
            period_end=datetime.date(2026, 6, 30),
            period_type="monthly",
            pay_date=datetime.date(2026, 7, 5),
        )


@pytest.mark.django_db
def test_component_create(org):
    c = PayrollComponent.all_objects.create(
        org_id=org.id,
        code="EPF_EMP",
        name="EPF (employee)",
        type="deduction",
        is_statutory=True,
    )
    assert c.is_statutory is True


@pytest.mark.django_db
def test_payslip_unique_per_employee_period(org):
    p = PayrollPeriod.all_objects.create(
        org_id=org.id,
        period_start=datetime.date(2026, 6, 1),
        period_end=datetime.date(2026, 6, 30),
        period_type="monthly",
        pay_date=datetime.date(2026, 7, 5),
    )
    emp_id = uuid.uuid4()
    PayslipRecord.all_objects.create(
        org_id=org.id,
        employee_id=emp_id,
        period=p,
        gross=Decimal("5000"),
        net=Decimal("4250"),
        currency_code="MYR",
        source="csv_import",
    )
    with pytest.raises(IntegrityError):
        PayslipRecord.all_objects.create(
            org_id=org.id,
            employee_id=emp_id,
            period=p,
            gross=Decimal("1000"),
            net=Decimal("900"),
            currency_code="MYR",
            source="csv_import",
        )


@pytest.mark.django_db
def test_payroll_run_create(org):
    p = PayrollPeriod.all_objects.create(
        org_id=org.id,
        period_start=datetime.date(2026, 6, 1),
        period_end=datetime.date(2026, 6, 30),
        period_type="monthly",
        pay_date=datetime.date(2026, 7, 5),
    )
    run = PayrollRun.all_objects.create(
        org_id=org.id,
        period=p,
        status="draft",
        uploaded_by=uuid.uuid4(),
    )
    assert run.row_count == 0
    assert run.errors == []
