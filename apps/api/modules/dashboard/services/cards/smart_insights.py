"""SmartInsights card — proactive, rule-based recommendations (Layer 5).

All derived from existing data — no AI, no new models. Each insight answers
"what should I act on proactively?".
"""

from __future__ import annotations

import datetime
from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card


class SmartInsights(Card):
    type: ClassVar[str] = "smart_insights"
    requires_perms: ClassVar[list[str]] = ["employee:read:org"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from django.db.models import Q

        from modules.certification.models import Certification
        from modules.employee.models import Employee
        from modules.payslip.models import PayrollPeriod

        today = datetime.date.today()
        org_id = user.org_id
        emps = Employee.all_objects.filter(org_id=org_id, deleted_at__isnull=True)

        # Payroll countdown.
        period = (
            PayrollPeriod.all_objects.filter(
                org_id=org_id, deleted_at__isnull=True, pay_date__gte=today
            )
            .exclude(status="completed")
            .order_by("pay_date")
            .first()
        )
        payroll_days = (period.pay_date - today).days if period else None

        # Missing documents — cheap DB-level proxy (no decryption): an employee is
        # "incomplete" if a key non-encrypted field is blank.
        missing_docs = emps.filter(
            Q(date_of_birth__isnull=True)
            | Q(phone__isnull=True)
            | Q(phone="")
            | Q(emergency_contact_name__isnull=True)
            | Q(emergency_contact_name="")
        ).count()

        # Contracts expiring within 14 days.
        contracts_expiring = emps.filter(
            contract_end_date__range=(today, today + datetime.timedelta(days=14))
        ).count()

        # Certifications expiring within 30 days (org-wide).
        certs_expiring = Certification.all_objects.filter(
            org_id=org_id,
            status="active",
            deleted_at__isnull=True,
            expires_on__range=(today, today + datetime.timedelta(days=30)),
        ).count()

        # Probation.
        probation = emps.filter(status="probation").count()
        probation_ending = emps.filter(
            status="probation",
            probation_end_date__range=(today, today + datetime.timedelta(days=7)),
        ).count()

        return {
            "type": cls.type,
            "title": "Smart insights",
            "data": {
                "payroll_days": payroll_days,
                "missing_docs": missing_docs,
                "contracts_expiring": contracts_expiring,
                "certs_expiring": certs_expiring,
                "probation": probation,
                "probation_ending": probation_ending,
            },
        }
