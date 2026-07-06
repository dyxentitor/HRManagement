"""Compact hierarchy queries for the Organization Chart (v1.54.0).

Uses ``Employee.all_objects`` with an explicit ``org_id`` + soft-delete filter so
the same functions work when called directly (unit tests, no request context) and
from within a request. Reverse-FK counts are filtered to exclude soft-deleted rows
because ``Count`` annotations bypass model managers and hit the table directly.
"""

from __future__ import annotations

from django.db.models import Count, Q, QuerySet

from modules.employee.models import Employee
from modules.organization.models import Department

_MAX_DEPTH = 20  # cycle guard for ancestor walks


def _base(org_id) -> QuerySet[Employee]:
    return (
        Employee.all_objects.filter(org_id=org_id, deleted_at__isnull=True)
        .select_related("department", "manager")
        .annotate(
            _dr=Count(
                "direct_reports",
                filter=Q(direct_reports__deleted_at__isnull=True),
            )
        )
    )


def roots_qs(org_id) -> QuerySet[Employee]:
    return _base(org_id).filter(manager__isnull=True).order_by("first_name", "last_name")


def children_qs(org_id, manager_id) -> QuerySet[Employee]:
    return _base(org_id).filter(manager_id=manager_id).order_by("first_name", "last_name")


def department_members_qs(org_id, department_id) -> QuerySet[Employee]:
    return _base(org_id).filter(department_id=department_id).order_by("first_name", "last_name")


def department_groups(org_id) -> list[dict]:
    rows = (
        Department.all_objects.filter(org_id=org_id, deleted_at__isnull=True)
        .annotate(
            head_count=Count(
                "employees",
                filter=Q(employees__deleted_at__isnull=True),
            )
        )
        .filter(head_count__gt=0)
        .order_by("name")
        .values("id", "name", "head_count")
    )
    return [{"id": str(r["id"]), "name": r["name"], "head_count": r["head_count"]} for r in rows]


def _ancestor_ids(emp: Employee) -> list[str]:
    """Walk manager_id upward; return root→parent id path (strings), cycle-guarded."""
    ids: list[str] = []
    seen: set = set()
    cur = emp.manager_id
    depth = 0
    while cur and depth < _MAX_DEPTH and cur not in seen:
        seen.add(cur)
        ids.append(str(cur))
        cur = Employee.all_objects.filter(pk=cur).values_list("manager_id", flat=True).first()
        depth += 1
    ids.reverse()  # root -> parent
    return ids


def search_nodes(org_id, term: str) -> list[tuple[Employee, list[str]]]:
    term = (term or "").strip()
    if not term:
        return []
    qs = (
        _base(org_id)
        .filter(
            Q(first_name__icontains=term)
            | Q(last_name__icontains=term)
            | Q(preferred_name__icontains=term)
            | Q(role_title__icontains=term)
            | Q(department__name__icontains=term)
            | Q(email__icontains=term)
        )
        .order_by("first_name", "last_name")[:50]
    )
    return [(emp, _ancestor_ids(emp)) for emp in qs]
