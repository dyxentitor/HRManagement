"""Soft warnings for bulk-fill: leave overlap, OT, coverage drop.

All warnings are display-only; never block the save.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from uuid import UUID

from modules.employee.models import Employee
from modules.leave.models import LeaveRequest
from modules.schedule.models import Shift, ShiftAssignment

OT_THRESHOLD_HOURS_PER_WEEK = 48


def compute_warnings(
    *,
    org_id: UUID,
    cells: list[dict],
    shift_id: str,
) -> list[dict]:
    if not cells:
        return []

    shift = Shift.all_objects.get(org_id=org_id, id=shift_id, deleted_at__isnull=True)
    hours_per_shift = _shift_hours(shift)

    warnings: list[dict] = []
    work_dates = {dt.date.fromisoformat(c["work_date"]) for c in cells}

    warnings.extend(_leave_overlap_warnings(org_id, cells))
    warnings.extend(_overtime_warnings(org_id, cells, hours_per_shift))
    warnings.extend(_coverage_warnings(org_id, cells, work_dates))
    return warnings


def _shift_hours(shift: Shift) -> float:
    s = shift.start_time.hour + shift.start_time.minute / 60
    e = shift.end_time.hour + shift.end_time.minute / 60
    diff = (e - s) % 24
    if diff == 0 and shift.crosses_midnight:
        return 24
    return diff


def _leave_overlap_warnings(org_id: UUID, cells: list[dict]) -> list[dict]:
    out: list[dict] = []
    by_emp_date: dict[tuple[UUID, dt.date], None] = {
        (UUID(c["employee_id"]), dt.date.fromisoformat(c["work_date"])): None for c in cells
    }
    employee_ids = {UUID(c["employee_id"]) for c in cells}
    leaves = LeaveRequest.all_objects.filter(
        org_id=org_id,
        deleted_at__isnull=True,
        status="approved",
        employee_id__in=employee_ids,
    )
    for lr in leaves:
        cur = lr.start_date
        while cur <= lr.end_date:
            if (lr.employee_id, cur) in by_emp_date:
                emp = Employee.all_objects.get(id=lr.employee_id)
                out.append(
                    {
                        "rule": "leave_overlap",
                        "employee_id": str(lr.employee_id),
                        "employee_name": emp.full_name,
                        "date": cur.isoformat(),
                        "message": (f"{emp.full_name} has approved leave on {cur.isoformat()}"),
                    }
                )
            cur += dt.timedelta(days=1)
    return out


def _overtime_warnings(
    org_id: UUID,
    cells: list[dict],
    hours_per_shift: float,
) -> list[dict]:
    """Sum hours per (employee, ISO week) including existing assignments."""
    out: list[dict] = []
    proposed_per_week: dict[tuple[UUID, tuple[int, int]], float] = defaultdict(float)
    for c in cells:
        emp_id = UUID(c["employee_id"])
        d = dt.date.fromisoformat(c["work_date"])
        iso = (d.isocalendar().year, d.isocalendar().week)
        proposed_per_week[(emp_id, iso)] += hours_per_shift

    employee_ids = {emp_id for emp_id, _ in proposed_per_week}
    if not employee_ids:
        return out

    iso_keys = {iso for _, iso in proposed_per_week}
    monday_dates = [dt.date.fromisocalendar(year, week, 1) for year, week in iso_keys]
    range_from = min(monday_dates)
    range_to = max(monday_dates) + dt.timedelta(days=6)

    existing = ShiftAssignment.all_objects.filter(
        org_id=org_id,
        deleted_at__isnull=True,
        employee_id__in=employee_ids,
        work_date__gte=range_from,
        work_date__lte=range_to,
    ).select_related("shift")
    existing_per_week: dict[tuple[UUID, tuple[int, int]], float] = defaultdict(float)
    for a in existing:
        iso = (a.work_date.isocalendar().year, a.work_date.isocalendar().week)
        existing_per_week[(a.employee_id, iso)] += _shift_hours(a.shift)

    for (emp_id, iso), proposed_hours in proposed_per_week.items():
        total = proposed_hours + existing_per_week.get((emp_id, iso), 0.0)
        if total > OT_THRESHOLD_HOURS_PER_WEEK:
            emp = Employee.all_objects.get(id=emp_id)
            out.append(
                {
                    "rule": "overtime",
                    "employee_id": str(emp_id),
                    "employee_name": emp.full_name,
                    "iso_year": iso[0],
                    "iso_week": iso[1],
                    "hours": round(total, 1),
                    "message": (
                        f"{emp.full_name} would have {round(total, 1)}h scheduled in week "
                        f"{iso[1]}/{iso[0]} (over {OT_THRESHOLD_HOURS_PER_WEEK}h)"
                    ),
                }
            )
    return out


def _coverage_warnings(
    org_id: UUID,
    cells: list[dict],
    work_dates: set[dt.date],
) -> list[dict]:
    """For each team with min_headcount, check if any work_date falls under min."""
    from modules.employee.models import Team

    out: list[dict] = []
    cell_emp_dates: dict[dt.date, set[UUID]] = defaultdict(set)
    for c in cells:
        cell_emp_dates[dt.date.fromisoformat(c["work_date"])].add(UUID(c["employee_id"]))

    teams = Team.all_objects.filter(
        org_id=org_id,
        deleted_at__isnull=True,
        min_headcount__isnull=False,
    )
    for team in teams:
        team_member_ids = set(
            Employee.all_objects.filter(team=team, deleted_at__isnull=True).values_list(
                "id", flat=True
            )
        )
        for d in work_dates:
            existing = ShiftAssignment.all_objects.filter(
                org_id=org_id,
                deleted_at__isnull=True,
                employee_id__in=team_member_ids,
                work_date=d,
            ).values_list("employee_id", flat=True)
            existing_set = set(existing)
            proposed = {
                emp_id for emp_id in cell_emp_dates.get(d, set()) if emp_id in team_member_ids
            }
            scheduled = len(existing_set | proposed)
            if scheduled < team.min_headcount:
                out.append(
                    {
                        "rule": "coverage_drop",
                        "team_id": str(team.id),
                        "team_name": team.name,
                        "date": d.isoformat(),
                        "scheduled": scheduled,
                        "min": team.min_headcount,
                        "message": (
                            f"{team.name} coverage on {d.isoformat()}: "
                            f"{scheduled}/{team.min_headcount}"
                        ),
                    }
                )
    return out
