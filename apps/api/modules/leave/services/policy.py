"""PolicyService — find applicable policy + compute tenure-bracketed entitlement."""

from __future__ import annotations

import datetime
import uuid
from decimal import Decimal

from django.db.models import Q

from modules.leave.models import LeavePolicy, LeaveType


class PolicyService:
    @staticmethod
    def compute_entitled_days(
        *,
        policy: LeavePolicy,
        hire_date: datetime.date,
        as_of: datetime.date,
    ) -> Decimal:
        """Compute the entitled days based on tenure brackets.

        Tenure brackets are a list of ``{"min_years": N, "days": D}`` rows sorted
        ascending by min_years. We pick the highest bracket whose ``min_years``
        does not exceed the employee's tenure on ``as_of``.
        """
        years_of_service = (as_of - hire_date).days / 365.25

        brackets = policy.tenure_brackets or []
        if not brackets:
            return Decimal(str(policy.days_per_year))

        best = Decimal(str(policy.days_per_year))
        sorted_brackets = sorted(brackets, key=lambda b: b["min_years"])
        for b in sorted_brackets:
            if years_of_service >= b["min_years"]:
                best = Decimal(str(b["days"]))
        return best

    @staticmethod
    def find_applicable_policy(
        *,
        leave_type: LeaveType,
        as_of: datetime.date,
        role_id: uuid.UUID | None = None,
        department_id: uuid.UUID | None = None,
    ) -> LeavePolicy | None:
        """Find the most-specific policy applicable to a (type, role, dept, date)."""
        active = LeavePolicy.objects.filter(
            leave_type=leave_type,
            effective_from__lte=as_of,
        ).filter(Q(effective_to__isnull=True) | Q(effective_to__gte=as_of))

        # Specificity ranking: role-specific > dept-specific > org-wide
        if role_id is not None:
            specific = active.filter(applies_to_role_id=role_id).first()
            if specific:
                return specific
        if department_id is not None:
            specific = active.filter(applies_to_department_id=department_id).first()
            if specific:
                return specific
        return active.filter(
            applies_to_role_id__isnull=True,
            applies_to_department_id__isnull=True,
        ).first()
