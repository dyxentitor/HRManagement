"""KPI template and definition CRUD service."""

from __future__ import annotations

import uuid

from django.db import transaction

from ..models import KpiDefinition, KpiTemplate


class TemplateService:
    @staticmethod
    @transaction.atomic
    def create_template(
        *,
        org_id: uuid.UUID,
        name: str,
        description: str = "",
        applies_to_role_id: uuid.UUID | None = None,
        applies_to_dept_id: uuid.UUID | None = None,
    ) -> KpiTemplate:
        return KpiTemplate.all_objects.create(
            org_id=org_id,
            name=name,
            description=description,
            applies_to_role_id=applies_to_role_id,
            applies_to_dept_id=applies_to_dept_id,
        )

    @staticmethod
    @transaction.atomic
    def clone_template(template: KpiTemplate, *, new_name: str) -> KpiTemplate:
        """Clone a template and all its definitions."""
        new = KpiTemplate.all_objects.create(
            org_id=template.org_id,
            name=new_name,
            description=template.description,
            applies_to_role_id=template.applies_to_role_id,
            applies_to_dept_id=template.applies_to_dept_id,
        )
        for defn in template.definitions.all():
            KpiDefinition.objects.create(
                template=new,
                code=defn.code,
                name=defn.name,
                description=defn.description,
                metric_type=defn.metric_type,
                target=defn.target,
                unit=defn.unit,
                weight=defn.weight,
                evidence_required=defn.evidence_required,
                sort_order=defn.sort_order,
            )
        return new

    @staticmethod
    def add_definition(
        template: KpiTemplate,
        *,
        code: str,
        name: str,
        metric_type: str,
        description: str = "",
        target=None,
        unit: str = "",
        weight=1,
        evidence_required: bool = False,
        sort_order: int = 0,
    ) -> KpiDefinition:
        return KpiDefinition.objects.create(
            template=template,
            code=code,
            name=name,
            description=description,
            metric_type=metric_type,
            target=target,
            unit=unit,
            weight=weight,
            evidence_required=evidence_required,
            sort_order=sort_order,
        )
