"""Calendar service — single-read payload assembly for the roster page.

Consolidates: teams + members, shifts catalog, assignments in range,
approved leaves in range, holidays in range, and per-day stats with
coverage warnings.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from uuid import UUID

from django.db.models import Q

from modules.employee.models import Employee, Team
from modules.leave.models import LeaveRequest
from modules.schedule.models import Holiday, Shift, ShiftAssignment


def _date_range(date_from: dt.date, date_to: dt.date) -> list[dt.date]:
    span = (date_to - date_from).days + 1
    return [date_from + dt.timedelta(days=i) for i in range(span)]


def build_calendar(
    *,
    org_id: UUID,
    date_from: dt.date,
    date_to: dt.date,
    team_id: UUID | str | None = None,
    department_id: UUID | str | None = None,
    q: str | None = None,
    include_inactive: bool = False,
) -> dict:
    teams_qs = Team.all_objects.filter(
        org_id=org_id,
        deleted_at__isnull=True,
    ).order_by("sort_order", "name")
    if team_id:
        teams_qs = teams_qs.filter(id=team_id)

    employee_filter = Q(org_id=org_id, deleted_at__isnull=True)
    if not include_inactive:
        employee_filter &= Q(status="active")
    if department_id:
        employee_filter &= Q(department_id=department_id)
    if team_id:
        employee_filter &= Q(team_id=team_id)
    if q:
        employee_filter &= (
            Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(employee_code__icontains=q)
        )

    employees = list(
        Employee.all_objects.filter(employee_filter)
        .select_related("department", "team")
        .order_by("team__sort_order", "first_name", "last_name")
    )

    live_team_ids = set(teams_qs.values_list("id", flat=True))

    employees_by_team: dict[UUID | None, list[Employee]] = defaultdict(list)
    for e in employees:
        # Treat soft-deleted-team employees as unassigned (carry-forward fix
        # for orphans when an admin soft-deletes a team).
        if e.team_id is None or e.team_id not in live_team_ids:
            employees_by_team[None].append(e)
        else:
            employees_by_team[e.team_id].append(e)

    teams_payload = []
    for team in teams_qs:
        members = employees_by_team.get(team.id, [])
        teams_payload.append(
            {
                "id": str(team.id),
                "name": team.name,
                "sort_order": team.sort_order,
                "min_headcount": team.min_headcount,
                "parent_team_id": str(team.parent_team_id) if team.parent_team_id else None,
                "members": [_employee_payload(e) for e in members],
            }
        )

    unassigned = employees_by_team.get(None, [])
    if unassigned:
        teams_payload.append(
            {
                "id": None,
                "name": "Unassigned",
                "sort_order": 9999,
                "min_headcount": None,
                "parent_team_id": None,
                "members": [_employee_payload(e) for e in unassigned],
            }
        )

    employee_ids = [e.id for e in employees]

    shifts = list(Shift.all_objects.filter(org_id=org_id, deleted_at__isnull=True).order_by("name"))
    shifts_payload = [
        {
            "id": str(s.id),
            "code": s.code,
            "name": s.name,
            "start_time": s.start_time.strftime("%H:%M"),
            "end_time": s.end_time.strftime("%H:%M"),
            "color": s.color,
            "crosses_midnight": s.crosses_midnight,
        }
        for s in shifts
    ]

    assignments = list(
        ShiftAssignment.all_objects.filter(
            org_id=org_id,
            deleted_at__isnull=True,
            employee_id__in=employee_ids,
            work_date__gte=date_from,
            work_date__lte=date_to,
        )
        .select_related("shift", "covering_for")
        .order_by("work_date", "employee_id")
    )
    assignments_payload = [
        {
            "id": str(a.id),
            "employee_id": str(a.employee_id),
            "work_date": a.work_date.isoformat(),
            "shift_id": str(a.shift_id),
            "shift_code": a.shift.code,
            "covering_for_id": str(a.covering_for_id) if a.covering_for_id else None,
            "covering_for_name": (a.covering_for.full_name if a.covering_for_id else None),
            "is_published": a.is_published,
            "notes": a.notes,
        }
        for a in assignments
    ]

    leaves = list(
        LeaveRequest.all_objects.filter(
            org_id=org_id,
            deleted_at__isnull=True,
            status="approved",
            employee_id__in=employee_ids,
            start_date__lte=date_to,
            end_date__gte=date_from,
        ).values("employee_id", "start_date", "end_date", "leave_type__code")
    )
    leaves_payload = []
    for lr in leaves:
        cur = max(lr["start_date"], date_from)
        last = min(lr["end_date"], date_to)
        while cur <= last:
            leaves_payload.append(
                {
                    "employee_id": str(lr["employee_id"]),
                    "date": cur.isoformat(),
                    "type": lr["leave_type__code"],
                }
            )
            cur += dt.timedelta(days=1)

    holidays = list(
        Holiday.all_objects.filter(
            org_id=org_id,
            deleted_at__isnull=True,
            date__gte=date_from,
            date__lte=date_to,
        ).values("date", "name", "type")
    )
    holidays_payload = [
        {"date": h["date"].isoformat(), "name": h["name"], "type": h["type"]} for h in holidays
    ]

    stats = _build_stats(
        teams_qs=list(teams_qs),
        assignments=assignments,
        date_range=_date_range(date_from, date_to),
        employees=employees,
    )

    return {
        "range": {"from": date_from.isoformat(), "to": date_to.isoformat()},
        "teams": teams_payload,
        "shifts": shifts_payload,
        "assignments": assignments_payload,
        "leaves": leaves_payload,
        "holidays": holidays_payload,
        "stats": stats,
    }


def _employee_payload(e: Employee) -> dict:
    return {
        "id": str(e.id),
        "full_name": e.full_name,
        "employee_code": e.employee_code,
        "status": e.status,
        "department_name": e.department.name if e.department_id else None,
        "role_title": e.role_title,
        "team_id": str(e.team_id) if e.team_id else None,
    }


def _build_stats(*, teams_qs, assignments, date_range, employees) -> dict:
    by_day: dict[dt.date, dict] = {d: {"hours": 0.0, "employees": set()} for d in date_range}
    for a in assignments:
        start, end = a.shift.start_time, a.shift.end_time
        hours = ((end.hour + end.minute / 60) - (start.hour + start.minute / 60)) % 24
        if hours == 0 and a.shift.crosses_midnight:
            hours = 24
        by_day[a.work_date]["hours"] += hours
        by_day[a.work_date]["employees"].add(a.employee_id)

    by_day_list = [
        {
            "date": d.isoformat(),
            "hours": round(by_day[d]["hours"], 2),
            "headcount": len(by_day[d]["employees"]),
        }
        for d in date_range
    ]

    total_hours = round(sum(d["hours"] for d in by_day_list), 2)
    total_headcount = len({a.employee_id for a in assignments})

    coverage_payload = []
    for team in teams_qs:
        if team.min_headcount is None:
            continue
        team_employee_ids = {e.id for e in employees if e.team_id == team.id}
        team_by_day = []
        for d in date_range:
            scheduled = sum(
                1 for a in assignments if a.work_date == d and a.employee_id in team_employee_ids
            )
            team_by_day.append(
                {
                    "date": d.isoformat(),
                    "scheduled": scheduled,
                    "min": team.min_headcount,
                    "ok": scheduled >= team.min_headcount,
                }
            )
        coverage_payload.append(
            {
                "team_id": str(team.id),
                "team_name": team.name,
                "by_day": team_by_day,
            }
        )

    return {
        "by_day": by_day_list,
        "totals": {"hours": total_hours, "headcount": total_headcount},
        "coverage": coverage_payload,
    }
