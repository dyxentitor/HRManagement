"""Smoke test: seed_provintell management command is idempotent."""

from __future__ import annotations

import pytest
from django.core.management import call_command

from modules.employee.models import Employee


@pytest.mark.django_db(transaction=True)
def test_seed_provintell_idempotent():
    """Running seed_provintell twice must not create duplicate employees."""
    call_command("seed_provintell")
    n_emps = Employee.all_objects.filter(deleted_at__isnull=True).count()
    assert n_emps >= 5, f"Expected at least 5 employees after first seed, got {n_emps}"

    call_command("seed_provintell")
    n_emps2 = Employee.all_objects.filter(deleted_at__isnull=True).count()
    assert n_emps2 == n_emps, (
        f"Idempotency violated: {n_emps} employees after first run, " f"{n_emps2} after second run"
    )
