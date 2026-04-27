"""Repository helpers for Employee."""

from __future__ import annotations

import uuid

from .models import Employee


class EmployeeRepository:
    @staticmethod
    def get(employee_id: uuid.UUID) -> Employee | None:
        return Employee.objects.filter(id=employee_id).first()

    @staticmethod
    def get_by_user_id(user_id: uuid.UUID) -> Employee | None:
        return Employee.objects.filter(user_id=user_id).first()
