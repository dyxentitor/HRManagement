"""Smoke tests for the seed_demo_data management command.

Verifies that after running the command:
  - 10 demo employees exist with codes PVT-DEMO-001..010
  - LeaveRequests, ClaimRequests, PayslipRecords, KpiAssignments, Certifications
    all meet minimum count requirements.
  - Re-running is idempotent (no duplicate rows).

The payroll_audit_ledger DB trigger is postgres-only; those assertions are
guarded with ``requires_postgres`` matching the pattern in
``common/audit/tests/test_payroll_chain.py``.

NOTE: All queries use ``all_objects`` (the unscoped manager) because there is
no HTTP request to set the thread-local org_id. The TenantScopedManager
(``objects``) returns an empty queryset when org_id is unset.
"""

from __future__ import annotations

import pytest
from django.core.management import call_command
from django.db import connection

from modules.certification.models import Certification, TrainingAssignment
from modules.claims.models import ClaimRequest
from modules.employee.models import Employee
from modules.kpi.models import KpiAssignment
from modules.leave.models import LeaveRequest
from modules.payslip.models import PayslipRecord

requires_postgres = pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="DB trigger is postgres-only; sqlite test runs skip this assertion",
)


def _demo_emp_ids():
    """Return IDs of all PVT-DEMO-* employees (unscoped)."""
    return Employee.all_objects.filter(
        employee_code__startswith="PVT-DEMO-",
        deleted_at__isnull=True,
    ).values_list("id", flat=True)


@pytest.mark.django_db(transaction=True)
def test_seed_demo_data_creates_10_employees():
    """seed_demo_data should create exactly 10 PVT-DEMO-* employees."""
    call_command("seed_provintell", verbosity=0)
    call_command("seed_demo_data", verbosity=0)

    count = Employee.all_objects.filter(
        employee_code__startswith="PVT-DEMO-",
        deleted_at__isnull=True,
    ).count()
    assert count == 10, f"Expected 10 demo employees, got {count}"


@pytest.mark.django_db(transaction=True)
def test_seed_demo_data_leave_requests():
    """At least 30 LeaveRequests for PVT-DEMO-* employees (3 per employee x 10)."""
    call_command("seed_provintell", verbosity=0)
    call_command("seed_demo_data", verbosity=0)

    count = LeaveRequest.all_objects.filter(
        employee_id__in=_demo_emp_ids(),
        deleted_at__isnull=True,
    ).count()
    assert count >= 30, f"Expected >= 30 leave requests, got {count}"


@pytest.mark.django_db(transaction=True)
def test_seed_demo_data_claim_requests():
    """At least 20 ClaimRequests for PVT-DEMO-* employees (2 per employee x 10)."""
    call_command("seed_provintell", verbosity=0)
    call_command("seed_demo_data", verbosity=0)

    count = ClaimRequest.all_objects.filter(
        employee__employee_code__startswith="PVT-DEMO-",
        deleted_at__isnull=True,
    ).count()
    assert count >= 20, f"Expected >= 20 claim requests, got {count}"


@pytest.mark.django_db(transaction=True)
def test_seed_demo_data_payslips():
    """Exactly 10 PayslipRecords for PVT-DEMO-* employees."""
    call_command("seed_provintell", verbosity=0)
    call_command("seed_demo_data", verbosity=0)

    count = PayslipRecord.all_objects.filter(
        employee_id__in=_demo_emp_ids(),
        deleted_at__isnull=True,
    ).count()
    assert count == 10, f"Expected 10 payslip records, got {count}"


@pytest.mark.django_db(transaction=True)
def test_seed_demo_data_kpi_assignments():
    """Exactly 10 KpiAssignments for PVT-DEMO-* employees."""
    call_command("seed_provintell", verbosity=0)
    call_command("seed_demo_data", verbosity=0)

    count = KpiAssignment.all_objects.filter(
        employee_id__in=_demo_emp_ids(),
        deleted_at__isnull=True,
    ).count()
    assert count == 10, f"Expected 10 KPI assignments, got {count}"


@pytest.mark.django_db(transaction=True)
def test_seed_demo_data_certifications():
    """At least 10 Certification rows for PVT-DEMO-* employees."""
    call_command("seed_provintell", verbosity=0)
    call_command("seed_demo_data", verbosity=0)

    count = Certification.all_objects.filter(
        employee_id__in=_demo_emp_ids(),
        deleted_at__isnull=True,
    ).count()
    assert count >= 10, f"Expected >= 10 certifications, got {count}"


@pytest.mark.django_db(transaction=True)
def test_seed_demo_data_training_assignments():
    """At least 20 TrainingAssignment rows for PVT-DEMO-* employees (2 plans x 10)."""
    call_command("seed_provintell", verbosity=0)
    call_command("seed_demo_data", verbosity=0)

    count = TrainingAssignment.all_objects.filter(
        employee_id__in=_demo_emp_ids(),
        deleted_at__isnull=True,
    ).count()
    assert count >= 20, f"Expected >= 20 training assignments, got {count}"


@pytest.mark.django_db(transaction=True)
def test_seed_demo_data_idempotent():
    """Running seed_demo_data twice must not duplicate any rows."""
    call_command("seed_provintell", verbosity=0)
    call_command("seed_demo_data", verbosity=0)

    emp_ids = list(_demo_emp_ids())

    n_emp_1 = len(emp_ids)
    n_leave_1 = LeaveRequest.all_objects.filter(
        employee_id__in=emp_ids, deleted_at__isnull=True
    ).count()
    n_claims_1 = ClaimRequest.all_objects.filter(
        employee__employee_code__startswith="PVT-DEMO-",
        deleted_at__isnull=True,
    ).count()
    n_payslips_1 = PayslipRecord.all_objects.filter(
        employee_id__in=emp_ids, deleted_at__isnull=True
    ).count()

    # Run again
    call_command("seed_demo_data", verbosity=0)

    n_emp_2 = Employee.all_objects.filter(
        employee_code__startswith="PVT-DEMO-",
        deleted_at__isnull=True,
    ).count()
    n_leave_2 = LeaveRequest.all_objects.filter(
        employee_id__in=emp_ids, deleted_at__isnull=True
    ).count()
    n_claims_2 = ClaimRequest.all_objects.filter(
        employee__employee_code__startswith="PVT-DEMO-",
        deleted_at__isnull=True,
    ).count()
    n_payslips_2 = PayslipRecord.all_objects.filter(
        employee_id__in=emp_ids, deleted_at__isnull=True
    ).count()

    assert n_emp_2 == n_emp_1, f"Idempotency violation: employees {n_emp_1} → {n_emp_2}"
    assert (
        n_leave_2 == n_leave_1
    ), f"Idempotency violation: leave requests {n_leave_1} → {n_leave_2}"
    assert (
        n_claims_2 == n_claims_1
    ), f"Idempotency violation: claim requests {n_claims_1} → {n_claims_2}"
    assert (
        n_payslips_2 == n_payslips_1
    ), f"Idempotency violation: payslips {n_payslips_1} → {n_payslips_2}"


@pytest.mark.django_db(transaction=True)
def test_seed_demo_data_prod_flag_skips():
    """--prod flag must produce a skip message and create no demo employees."""
    call_command("seed_provintell", verbosity=0)
    call_command("seed_demo_data", "--prod", verbosity=0)

    count = Employee.all_objects.filter(
        employee_code__startswith="PVT-DEMO-",
        deleted_at__isnull=True,
    ).count()
    assert count == 0, f"Expected 0 demo employees with --prod flag, got {count}"


@requires_postgres
@pytest.mark.django_db(transaction=True)
def test_seed_demo_data_payroll_audit_ledger():
    """Payroll audit ledger rows should be written for each demo payslip (postgres only)."""
    from common.audit.models import PayrollAuditLedger

    call_command("seed_provintell", verbosity=0)
    initial_count = PayrollAuditLedger.objects.count()

    call_command("seed_demo_data", verbosity=0)

    new_count = PayrollAuditLedger.objects.count()
    assert new_count >= initial_count + 10, (
        f"Expected >= 10 new payroll audit ledger rows, " f"got {new_count - initial_count}"
    )
