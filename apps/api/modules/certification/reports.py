"""Certification module reports."""

from __future__ import annotations

import datetime
from typing import ClassVar

from common.reporting.registry import Report, register

from .models import Certification


@register
class CertExpiringsSoon(Report):
    code = "cert.expiring_soon"
    title = "Certifications expiring soon"
    permissions: ClassVar[list] = ["cert:read:org"]
    columns: ClassVar[list] = [
        {"field": "employee_id", "label": "Employee ID"},
        {"field": "name", "label": "Certification"},
        {"field": "issuer", "label": "Issuer"},
        {"field": "expires_on", "label": "Expires on"},
        {"field": "status", "label": "Status"},
    ]
    filters: ClassVar[list] = [
        {"field": "within_days", "type": "number", "label": "Expiring within days"},
    ]
    exporters: ClassVar[list] = ["csv", "xlsx"]

    @classmethod
    def queryset(cls, *, filters: dict, user):
        today = datetime.date.today()
        within_days = int(filters.get("within_days") or 90)
        cutoff = today + datetime.timedelta(days=within_days)
        return Certification.all_objects.filter(
            org_id=user.org_id,
            deleted_at__isnull=True,
            expires_on__gte=today,
            expires_on__lte=cutoff,
        ).order_by("expires_on")
