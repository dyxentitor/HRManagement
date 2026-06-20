"""Audit-log viewer API — read-only, paginated, filterable.

Gated on ``audit:read:org`` (org_admin / hr_manager / auditor). The log itself
stays append-only; this only reads it. Sensitive salary / bank / national-id
fields inside before/after are redacted unless the caller also holds the
relevant read permission.
"""

from __future__ import annotations

import csv
from typing import Any, ClassVar

from django.db.models import Q
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.identity.permissions import HRMSPermission
from modules.identity.services.permissions import get_user_perms

from .models import AuditLog

# Field names (top-level keys in before/after) considered sensitive.
SALARY_KEYS = frozenset({"salary", "base_salary", "monthly_salary", "gross", "net"})
BANK_ID_KEYS = frozenset(
    {
        "bank_account_number",
        "bank_name",
        "ic_number",
        "passport_no",
        "lhdn_tax_no",
        "epf_no",
        "socso_no",
        "eis_no",
    }
)
_REDACTED = "•••••"

_MAX_CSV_ROWS = 10_000
_DEFAULT_PAGE_SIZE = 50
_MAX_PAGE_SIZE = 200


def _redact(data: dict[str, Any] | None, *, can_salary: bool, can_bank: bool) -> dict | None:
    if not isinstance(data, dict):
        return data
    out: dict[str, Any] = {}
    for k, v in data.items():
        kl = k.lower()
        if (kl in SALARY_KEYS and not can_salary) or (kl in BANK_ID_KEYS and not can_bank):
            out[k] = _REDACTED
        else:
            out[k] = v
    return out


class AuditLogListView(APIView):
    permission_classes: ClassVar[list] = [HRMSPermission]
    required_perms: ClassVar[list[str]] = ["audit:read:org"]

    def get(self, request):
        qs = AuditLog.objects.filter(org_id=request.user.org_id)

        actor_id = request.query_params.get("actor_id")
        entity = request.query_params.get("entity")
        action = request.query_params.get("action")
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        q = request.query_params.get("q")
        if actor_id:
            qs = qs.filter(actor_id=actor_id)
        if entity:
            qs = qs.filter(entity=entity)
        if action:
            qs = qs.filter(action__icontains=action)
        if date_from:
            qs = qs.filter(ts__date__gte=date_from)
        if date_to:
            qs = qs.filter(ts__date__lte=date_to)
        if q:
            qs = qs.filter(Q(action__icontains=q) | Q(entity__icontains=q))
        qs = qs.order_by("-ts")

        perms = get_user_perms(request.user)
        can_salary = "employee:salary:read" in perms
        can_bank = "employee:bank:read" in perms

        # NB: not "format" — that collides with DRF's format-override query param.
        if request.query_params.get("export") == "csv":
            return self._csv(qs[:_MAX_CSV_ROWS], can_salary=can_salary, can_bank=can_bank)

        try:
            page = max(1, int(request.query_params.get("page", 1)))
            page_size = min(
                _MAX_PAGE_SIZE,
                max(1, int(request.query_params.get("page_size", _DEFAULT_PAGE_SIZE))),
            )
        except ValueError:
            page, page_size = 1, _DEFAULT_PAGE_SIZE

        count = qs.count()
        rows = list(qs[(page - 1) * page_size : page * page_size])
        names = self._actor_names(rows)
        results = [
            self._serialize(r, names, can_salary=can_salary, can_bank=can_bank) for r in rows
        ]
        # Distinct entity types for the filter dropdown (cheap, org-scoped).
        entities = sorted(
            AuditLog.objects.filter(org_id=request.user.org_id)
            .values_list("entity", flat=True)
            .distinct()
        )
        return Response(
            {
                "results": results,
                "count": count,
                "page": page,
                "page_size": page_size,
                "entities": entities,
            }
        )

    @staticmethod
    def _actor_names(rows) -> dict:
        from modules.employee.models import Employee

        actor_ids = {r.actor_id for r in rows if r.actor_id}
        if not actor_ids:
            return {}
        return {
            e.user_id: f"{e.first_name} {e.last_name}".strip()
            for e in Employee.all_objects.filter(user_id__in=actor_ids, deleted_at__isnull=True)
        }

    @staticmethod
    def _serialize(r: AuditLog, names: dict, *, can_salary: bool, can_bank: bool) -> dict:
        return {
            "id": r.id,
            "ts": r.ts.isoformat(),
            "actor_id": str(r.actor_id) if r.actor_id else None,
            "actor": names.get(r.actor_id) or "System",
            "action": r.action,
            "entity": r.entity,
            "entity_id": str(r.entity_id),
            "before": _redact(r.before, can_salary=can_salary, can_bank=can_bank),
            "after": _redact(r.after, can_salary=can_salary, can_bank=can_bank),
            "ip": r.ip,
        }

    def _csv(self, rows, *, can_salary: bool, can_bank: bool):
        import json

        from django.http import HttpResponse

        names = self._actor_names(list(rows))
        resp = HttpResponse(content_type="text/csv")
        resp["Content-Disposition"] = 'attachment; filename="audit-log.csv"'
        w = csv.writer(resp)
        w.writerow(["timestamp", "actor", "action", "entity", "entity_id", "before", "after", "ip"])
        for r in rows:
            s = self._serialize(r, names, can_salary=can_salary, can_bank=can_bank)
            w.writerow(
                [
                    s["ts"],
                    s["actor"],
                    s["action"],
                    s["entity"],
                    s["entity_id"],
                    json.dumps(s["before"]) if s["before"] is not None else "",
                    json.dumps(s["after"]) if s["after"] is not None else "",
                    s["ip"] or "",
                ]
            )
        return resp
