"""Domain services for Employee. Wraps writes for audit + invariants."""

from __future__ import annotations

from typing import Any

from .models import Employee


class EmployeeService:
    @staticmethod
    def create(*, org_id, **fields: Any) -> Employee:
        return Employee.objects.create(org_id=org_id, **fields)

    @staticmethod
    def update(employee: Employee, **fields: Any) -> Employee:
        for k, v in fields.items():
            setattr(employee, k, v)
        # Auto-compute the *_last4 helpers when bank/IC fields change
        if fields.get("bank_account_number"):
            employee.bank_account_last4 = fields["bank_account_number"][-4:]
        if fields.get("ic_number"):
            employee.ic_last4 = fields["ic_number"][-4:]
        employee.save()
        return employee
