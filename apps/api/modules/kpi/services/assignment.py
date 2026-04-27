"""Bulk-assign templates with snapshot of definitions at assign time."""

from __future__ import annotations

import uuid

from django.db import transaction

from ..models import KpiAssignment, KpiCycle, KpiTemplate


def _snapshot_definitions(template: KpiTemplate) -> list[dict]:
    """Deep-copy definitions to JSON-safe dicts (Decimal → str)."""
    return [
        {
            "code": d.code,
            "name": d.name,
            "description": d.description,
            "metric_type": d.metric_type,
            "target": str(d.target) if d.target is not None else None,
            "unit": d.unit,
            "weight": str(d.weight),
            "evidence_required": d.evidence_required,
            "sort_order": d.sort_order,
        }
        for d in template.definitions.all()
    ]


class AssignmentService:
    @staticmethod
    @transaction.atomic
    def bulk_assign(
        *,
        cycle: KpiCycle,
        template: KpiTemplate,
        employee_ids: list[uuid.UUID],
    ) -> int:
        """Create one KpiAssignment per employee with frozen kpis JSONB snapshot.

        Idempotent: skips employees already assigned in this cycle.
        Returns the count of new assignments created.
        """
        snapshot = _snapshot_definitions(template)
        n_created = 0
        for emp_id in employee_ids:
            existing = KpiAssignment.all_objects.filter(
                cycle=cycle, employee_id=emp_id, deleted_at__isnull=True
            ).first()
            if existing:
                continue
            KpiAssignment.all_objects.create(
                org_id=cycle.org_id,
                cycle=cycle,
                employee_id=emp_id,
                template=template,
                kpis=snapshot,
                status="pending",
            )
            n_created += 1
        return n_created
