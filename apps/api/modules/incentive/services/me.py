"""Employee 'My Mandays' summary — one derived aggregation for the /incentive page.

Everything here is DERIVED from the models + ledger (no new stored state), mirroring
``services/overview.py`` but from the individual contributor's perspective. Returns a plain
dict the frontend renders as a hero, KPIs, a lifecycle claim list, a personal trend, project
cards, and a payout flow. A caller with no linked Employee gets a well-formed empty payload
(``has_employee: false``) so the page shows an onboarding state instead of 500-ing.
"""

from __future__ import annotations

from django.db.models import Sum
from django.utils import timezone

from ..models import ZERO, Claim, EmployeeBond, MandayLedger, Project
from ..serializers import ClaimSerializer
from .ledger import (
    can_see_project,
    earnings_for,
    project_consumed,
    quarter_of,
    settings_rate,
)
from .overview import _recent_quarters

_EARNING_KEYS = (
    "earned_mandays",
    "earned_rm",
    "pending_mandays",
    "pending_rm",
    "this_quarter_mandays",
    "this_quarter_rm",
    "paid_mandays",
    "paid_rm",
)


def _empty_eligibility() -> dict:
    return {
        "has_bond": False,
        "bond_id": None,
        "accepted": False,
        "accepted_at": None,
        "period_start": None,
        "period_end": None,
        "is_active": False,
        "days_remaining": 0,
        "terms_version": "",
    }


def _empty(rate) -> dict:
    return {
        "has_employee": False,
        "rate": str(rate),
        "eligibility": _empty_eligibility(),
        "earnings": {k: "0" for k in _EARNING_KEYS},
        "claim_counts": {"pending": 0, "approved": 0, "rejected": 0, "cancelled": 0, "paid": 0},
        "claims": [],
        "trend": [],
        "my_projects": [],
        "claimable_projects": [],
        "payout": {
            "quarter": "",
            "mandays": "0",
            "rm": "0",
            "pending_ct": 0,
            "in_payroll_ct": 0,
            "paid_ct": 0,
        },
    }


def build_me_summary(employee, org_id) -> dict:
    rate = settings_rate(org_id)
    if employee is None:
        return _empty(rate)

    today = timezone.localdate()
    this_q = quarter_of(today)
    emp_id = employee.id
    claims_qs = Claim.objects.filter(org_id=org_id, employee_id=emp_id).order_by("-created_at")

    # --- eligibility (mandays bond) ---
    bond = EmployeeBond.objects.filter(org_id=org_id, employee_id=emp_id).first()
    if bond is not None:
        active = bond.is_active(today)
        eligibility = {
            "has_bond": True,
            "bond_id": str(bond.id),
            "accepted": bond.accepted_at is not None,
            "accepted_at": bond.accepted_at.isoformat() if bond.accepted_at else None,
            "period_start": bond.period_start.isoformat(),
            "period_end": bond.period_end.isoformat(),
            "is_active": active,
            "days_remaining": max(0, (bond.period_end - today).days) if active else 0,
            "terms_version": bond.terms_version,
        }
    else:
        eligibility = _empty_eligibility()

    # --- earnings (mandays-first; RM derived) ---
    earned = earnings_for(emp_id, org_id)
    pending_md = claims_qs.filter(status="pending").aggregate(s=Sum("mandays"))["s"] or ZERO
    this_q_md = (
        claims_qs.filter(status="approved", billing_quarter=this_q).aggregate(s=Sum("mandays"))[
            "s"
        ]
        or ZERO
    )
    paid_md = (
        claims_qs.filter(status="approved", payout_status="paid").aggregate(s=Sum("mandays"))["s"]
        or ZERO
    )
    earnings = {
        "earned_mandays": str(earned),
        "earned_rm": str(earned * rate),
        "pending_mandays": str(pending_md),
        "pending_rm": str(pending_md * rate),
        "this_quarter_mandays": str(this_q_md),
        "this_quarter_rm": str(this_q_md * rate),
        "paid_mandays": str(paid_md),
        "paid_rm": str(paid_md * rate),
    }

    # --- counts (approved excludes paid so the two filter chips don't double-count) ---
    claim_counts = {
        "pending": claims_qs.filter(status="pending").count(),
        "approved": claims_qs.filter(status="approved").exclude(payout_status="paid").count(),
        "rejected": claims_qs.filter(status="rejected").count(),
        "cancelled": claims_qs.filter(status="cancelled").count(),
        "paid": claims_qs.filter(status="approved", payout_status="paid").count(),
    }

    claims = ClaimSerializer(claims_qs, many=True).data

    # --- personal trend (approved mandays by quarter, last 4) ---
    quarters = _recent_quarters(today)
    by_q = dict(
        claims_qs.filter(status="approved", billing_quarter__in=quarters)
        .values_list("billing_quarter")
        .annotate(s=Sum("mandays"))
    )
    trend = [
        {
            "quarter": q,
            "mandays": str(by_q.get(q) or ZERO),
            "rm": str((by_q.get(q) or ZERO) * rate),
        }
        for q in quarters
    ]

    # --- my projects (projects this employee earned on) ---
    my_rows = (
        MandayLedger.objects.filter(org_id=org_id, to_employee_id=emp_id, project__isnull=False)
        .values("project_id")
        .annotate(net=Sum("delta"))
    )
    proj_map = {
        p.id: p
        for p in Project.objects.filter(id__in=[r["project_id"] for r in my_rows]).select_related(
            "customer"
        )
    }
    my_projects = []
    for r in my_rows:
        p = proj_map.get(r["project_id"])
        if p is None:
            continue
        my_md = -(r["net"] or ZERO)  # ledger delta is pool-perspective (payouts negative)
        if my_md <= ZERO:
            continue
        my_projects.append(
            {
                "id": str(p.id),
                "name": p.name,
                "customer_name": p.customer.name,
                "my_mandays": str(my_md),
                "budget": str(p.budget_mandays),
                "consumed": str(project_consumed(p.id)),
            }
        )

    # --- claimable projects (open, visible to me, with budget left) ---
    claimable = []
    for p in (
        Project.objects.filter(org_id=org_id, status="open")
        .select_related("customer")
        .order_by("deadline")
    ):
        if not can_see_project(employee, p):
            continue
        remaining = p.budget_mandays - project_consumed(p.id)
        if remaining <= ZERO:
            continue
        claimable.append(
            {
                "id": str(p.id),
                "name": p.name,
                "customer_name": p.customer.name,
                "remaining": str(remaining),
                "deadline": p.deadline.isoformat() if p.deadline else None,
            }
        )

    # --- this quarter's payout flow ---
    q_claims = claims_qs.filter(status="approved", billing_quarter=this_q)
    payout_md = q_claims.aggregate(s=Sum("mandays"))["s"] or ZERO
    payout = {
        "quarter": this_q,
        "mandays": str(payout_md),
        "rm": str(payout_md * rate),
        "pending_ct": q_claims.filter(payout_status="pending").count(),
        "in_payroll_ct": q_claims.filter(payout_status="approved").count(),
        "paid_ct": q_claims.filter(payout_status="paid").count(),
    }

    return {
        "has_employee": True,
        "rate": str(rate),
        "eligibility": eligibility,
        "earnings": earnings,
        "claim_counts": claim_counts,
        "claims": claims,
        "trend": trend,
        "my_projects": my_projects,
        "claimable_projects": claimable,
        "payout": payout,
    }
