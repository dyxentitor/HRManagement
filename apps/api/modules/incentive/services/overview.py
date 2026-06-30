"""Incentive command-center overview — one aggregation for the admin dashboard.

Everything here is DERIVED from the models + ledger (no new stored state). Returns a plain dict; the
frontend renders it as KPIs, pool gauges, a projects table, charts, the approval
queue, top contributors, an activity feed, and upcoming deadlines.
"""

from __future__ import annotations

from django.db.models import Sum
from django.utils import timezone

from modules.employee.models import Employee

from ..models import ZERO, Claim, Customer, MandayLedger, Project
from .ledger import project_consumed, quarter_of, settings_rate

_ACTIVITY_LABEL = {
    "pool_topup": "Pool top-up",
    "claim_payout": "Claim approved",
    "reclaimed": "Reclaimed",
}


def _employee_names(org_id, employee_ids) -> dict:
    rows = Employee.all_objects.filter(
        org_id=org_id, id__in=list(employee_ids), deleted_at__isnull=True
    ).values("id", "first_name", "last_name", "department__name")
    return {
        r["id"]: {
            "name": f"{r['first_name']} {r['last_name']}".strip(),
            "department": r["department__name"] or "",
        }
        for r in rows
    }


def _recent_quarters(today, n=4) -> list[str]:
    """The current quarter and the n-1 before it, oldest first, as 'YYYY-Q#'."""
    y, q = today.year, (today.month - 1) // 3 + 1
    out = []
    for _ in range(n):
        out.append(f"{y}-Q{q}")
        q -= 1
        if q == 0:
            q, y = 4, y - 1
    return list(reversed(out))


def build_overview(org_id) -> dict:
    rate = settings_rate(org_id)
    today = timezone.localdate()

    projects = list(Project.objects.filter(org_id=org_id).select_related("customer"))
    active = [p for p in projects if p.status == "open"]
    claims = Claim.objects.filter(org_id=org_id)

    pool_total = (
        MandayLedger.objects.filter(org_id=org_id, ledger_type="pool_topup").aggregate(
            s=Sum("delta")
        )["s"]
        or ZERO
    )
    pool_remaining = (
        MandayLedger.objects.filter(org_id=org_id).aggregate(s=Sum("delta"))["s"] or ZERO
    )
    allocated_budget = sum((p.budget_mandays for p in active), ZERO)
    consumed = -(
        MandayLedger.objects.filter(org_id=org_id, project__isnull=False).aggregate(s=Sum("delta"))[
            "s"
        ]
        or ZERO
    )

    pending = claims.filter(status="pending").count()
    approved = claims.filter(status="approved").count()
    rejected = claims.filter(status="rejected").count()

    this_q = quarter_of(today)
    payout_md_q = (
        claims.filter(status="approved", billing_quarter=this_q).aggregate(s=Sum("mandays"))["s"]
        or ZERO
    )

    kpis = {
        "total_projects": len(projects),
        "active_projects": len(active),
        "closed_projects": len(projects) - len(active),
        "pool_total": str(pool_total),
        "pool_remaining": str(pool_remaining),
        "allocated_budget": str(allocated_budget),
        "consumed": str(consumed),
        "pending_claims": pending,
        "approved_claims": approved,
        "rejected_claims": rejected,
        "payout_rm_quarter": str(payout_md_q * rate),
        "soc_projects": sum(1 for p in active if p.include_soc),
        "rate": str(rate),
    }

    # per-customer pools
    pools = []
    for c in Customer.objects.filter(org_id=org_id, is_active=True):
        remaining = c.mandays_remaining
        total = c.mandays_total
        used = total - remaining
        pools.append(
            {
                "id": str(c.id),
                "name": c.name,
                "project_count": sum(1 for p in projects if p.customer_id == c.id),
                "remaining": str(remaining),
                "total": str(total),
                "pct_used": float(used / total * 100) if total else 0.0,
            }
        )

    # slim project rows (table source)
    project_rows = []
    for p in projects:
        used = project_consumed(p.id)
        project_rows.append(
            {
                "id": str(p.id),
                "name": p.name,
                "customer_name": p.customer.name,
                "manager_id": str(p.manager_id),
                "budget": str(p.budget_mandays),
                "consumed": str(used),
                "remaining": str(p.budget_mandays - used),
                "status": p.status,
                "include_soc": p.include_soc,
                "deadline": p.deadline.isoformat() if p.deadline else None,
            }
        )

    # consumption by quarter (approved claim mandays)
    quarters = _recent_quarters(today)
    by_q = dict(
        claims.filter(status="approved", billing_quarter__in=quarters)
        .values_list("billing_quarter")
        .annotate(s=Sum("mandays"))
    )
    consumption = [{"quarter": q, "mandays": str(by_q.get(q) or ZERO)} for q in quarters]

    claim_breakdown = {"approved": approved, "pending": pending, "rejected": rejected}

    # top contributors (earnings = -Σ delta of payout/reclaim rows to the employee)
    rows = (
        MandayLedger.objects.filter(org_id=org_id, to_employee_id__isnull=False)
        .values("to_employee_id")
        .annotate(net=Sum("delta"))
        .order_by("net")  # most negative delta == highest earnings
    )
    names = _employee_names(org_id, [r["to_employee_id"] for r in rows])
    top_contributors = []
    for r in rows:
        mandays = -(r["net"] or ZERO)
        if mandays <= ZERO:
            continue
        info = names.get(r["to_employee_id"], {"name": "—", "department": ""})
        top_contributors.append(
            {
                "employee_id": str(r["to_employee_id"]),
                "name": info["name"],
                "department": info["department"],
                "mandays": str(mandays),
                "rm": str(mandays * rate),
            }
        )
        if len(top_contributors) >= 5:
            break

    # recent activity (last 8 ledger rows)
    recent = list(
        MandayLedger.objects.filter(org_id=org_id)
        .select_related("project", "customer")
        .order_by("-seq")[:8]
    )
    recent_activity = [
        {
            "type": r.ledger_type,
            "label_type": _ACTIVITY_LABEL.get(r.ledger_type, r.ledger_type),
            "mandays": str(abs(r.delta)),
            "target": (
                r.project.name if r.project_id else (r.customer.name if r.customer_id else "")
            ),
            "created_at": r.created_at.isoformat(),
        }
        for r in recent
    ]

    # upcoming deadlines (open projects with a deadline, soonest first)
    dated = sorted((p for p in active if p.deadline is not None), key=lambda p: p.deadline)
    deadlines = [
        {
            "id": str(p.id),
            "name": p.name,
            "customer_name": p.customer.name,
            "deadline": p.deadline.isoformat(),
            "overdue": p.deadline < today,
        }
        for p in dated
    ]

    return {
        "kpis": kpis,
        "pools": pools,
        "projects": project_rows,
        "consumption": consumption,
        "claim_breakdown": claim_breakdown,
        "top_contributors": top_contributors,
        "recent_activity": recent_activity,
        "deadlines": deadlines,
    }
