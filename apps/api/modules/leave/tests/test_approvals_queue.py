"""Leave Approvals queue service — tabs + summary + row flags."""

from __future__ import annotations

import datetime
import uuid

import pytest
from django.utils import timezone

from modules.employee.models import Employee
from modules.identity.models import User
from modules.leave.models import LeaveApproval, LeaveRequest, LeaveType
from modules.leave.services.approvals_queue import list_for_approver, summary_for_approver
from modules.organization.models import Department, Organization


def _emp(org, dept, code, user=None, manager=None):
    return Employee.all_objects.create(
        org_id=org.id,
        user=user,
        employee_code=code,
        first_name=code,
        last_name="T",
        email=f"{code.lower()}@x.com",
        hire_date=datetime.date(2024, 1, 1),
        employment_type="fulltime",
        department=dept,
        manager=manager,
    )


def _req(org, lt, emp_id, start, end, *, status="submitted", days_ago=1):
    return LeaveRequest.all_objects.create(
        org_id=org.id,
        employee_id=emp_id,
        leave_type=lt,
        start_date=start,
        end_date=end,
        total_days="2",
        status=status,
        submitted_at=timezone.now() - datetime.timedelta(days=days_ago),
    )


@pytest.fixture
def env():
    org = Organization.objects.create(
        name="X",
        slug=f"x-{uuid.uuid4().hex[:6]}",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    lt = LeaveType.all_objects.create(org_id=org.id, code="ANNUAL", name="Annual", is_paid=True)
    mgr_user = User.objects.create_user(
        email="mgr@x.com", password="x", org_id=org.id
    )  # pragma: allowlist secret
    mgr = _emp(org, dept, "MGR", user=mgr_user)
    p1 = _emp(org, dept, "P1", manager=mgr)
    p2 = _emp(org, dept, "P2", manager=mgr)
    return {
        "org": org,
        "dept": dept,
        "lt": lt,
        "mgr_user": mgr_user,
        "mgr": mgr,
        "p1": p1,
        "p2": p2,
    }


@pytest.mark.django_db
def test_awaiting_tab_lists_pending_and_flags(env):
    req = _req(
        env["org"],
        env["lt"],
        env["p1"].id,
        datetime.date(2026, 8, 20),
        datetime.date(2026, 8, 21),
        days_ago=6,
    )
    LeaveApproval.objects.create(
        leave_request=req, level=0, approver_id=env["mgr_user"].id, status="pending"
    )

    rows = list_for_approver(env["mgr_user"], "awaiting")
    assert [r["id"] for r in rows] == [str(req.id)]
    row = rows[0]
    assert row["actionable"] is True
    assert row["is_overdue"] is True  # submitted 6 days ago > 3
    assert row["name"] == "P1 T"
    assert row["is_conflict"] is False  # no peer overlap yet


@pytest.mark.django_db
def test_conflict_flag_flips_on_peer_overlap(env):
    req = _req(
        env["org"], env["lt"], env["p1"].id, datetime.date(2026, 8, 20), datetime.date(2026, 8, 22)
    )
    LeaveApproval.objects.create(
        leave_request=req, level=0, approver_id=env["mgr_user"].id, status="pending"
    )
    # peer P2 already off, overlapping the window
    _req(
        env["org"],
        env["lt"],
        env["p2"].id,
        datetime.date(2026, 8, 21),
        datetime.date(2026, 8, 23),
        status="approved",
    )

    row = list_for_approver(env["mgr_user"], "awaiting")[0]
    assert row["is_conflict"] is True


@pytest.mark.django_db
def test_approved_tab_and_summary(env):
    # one pending (awaiting), one already approved
    pend = _req(
        env["org"], env["lt"], env["p1"].id, datetime.date(2026, 9, 1), datetime.date(2026, 9, 2)
    )
    LeaveApproval.objects.create(
        leave_request=pend, level=0, approver_id=env["mgr_user"].id, status="pending"
    )
    done = _req(
        env["org"],
        env["lt"],
        env["p2"].id,
        datetime.date(2026, 7, 1),
        datetime.date(2026, 7, 2),
        status="approved",
    )
    LeaveApproval.objects.create(
        leave_request=done,
        level=0,
        approver_id=env["mgr_user"].id,
        status="approved",
        acted_at=timezone.now(),
    )

    approved = list_for_approver(env["mgr_user"], "approved")
    assert [r["id"] for r in approved] == [str(done.id)]
    assert approved[0]["actionable"] is False

    all_rows = list_for_approver(env["mgr_user"], "all")
    assert {r["id"] for r in all_rows} == {str(pend.id), str(done.id)}

    s = summary_for_approver(env["mgr_user"])
    assert s["awaiting_count"] == 1
    assert s["approved_this_week"] == 1


@pytest.mark.django_db
def test_approvals_endpoint_is_auth_only(env):
    from rest_framework.test import APIClient

    req = _req(
        env["org"], env["lt"], env["p1"].id, datetime.date(2026, 8, 20), datetime.date(2026, 8, 21)
    )
    LeaveApproval.objects.create(
        leave_request=req, level=0, approver_id=env["mgr_user"].id, status="pending"
    )
    client = APIClient()
    tok = client.post(
        "/api/v1/auth/login", {"email": "mgr@x.com", "password": "x"}, format="json"
    ).json()["access_token"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {tok}")

    r = client.get("/api/v1/leave/requests/approvals/?tab=awaiting")
    assert r.status_code == 200
    assert [row["id"] for row in r.json()] == [str(req.id)]

    s = client.get("/api/v1/leave/requests/approvals/summary/")
    assert s.status_code == 200
    assert s.json()["awaiting_count"] == 1
