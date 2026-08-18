"""Endpoint tests for /api/v1/schedule/swap-requests/."""

from __future__ import annotations

import datetime as dt

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from modules.schedule.models import ShiftSwapRequest

pytestmark = pytest.mark.django_db

# Relative so the suite never expires — validate_pair rejects past dates.
D1 = timezone.localdate() + dt.timedelta(days=14)
D2 = timezone.localdate() + dt.timedelta(days=16)
BASE = "/api/v1/schedule/swap-requests/"


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_employee_can_create_a_swap_request(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)

    resp = _client(e.user_a).post(
        BASE,
        {
            "requester_assignment": str(a1.id),
            "counterparty_assignment": str(a2.id),
            "reason": "family",
        },
        format="json",
    )

    assert resp.status_code == 201
    req = ShiftSwapRequest.all_objects.get(id=resp.data["id"])
    assert req.status == "pending"
    assert req.requester_id == e.emp_a.id
    assert req.counterparty_id == e.emp_b.id


def test_create_rejects_conflict_with_a_readable_message(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    e.make_assignment(e.emp_a, D2, e.shift_day)

    resp = _client(e.user_a).post(
        BASE,
        {"requester_assignment": str(a1.id), "counterparty_assignment": str(a2.id)},
        format="json",
    )

    assert resp.status_code == 400
    assert "already rostered" in str(resp.data)


def test_cannot_request_a_swap_for_someone_elses_shift(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_b, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_c, D2, e.shift_day)

    resp = _client(e.user_a).post(
        BASE,
        {"requester_assignment": str(a1.id), "counterparty_assignment": str(a2.id)},
        format="json",
    )

    assert resp.status_code == 400
    assert "your own shift" in str(resp.data)


def test_list_returns_only_my_requests(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    _client(e.user_a).post(
        BASE,
        {"requester_assignment": str(a1.id), "counterparty_assignment": str(a2.id)},
        format="json",
    )

    mine = _client(e.user_a).get(BASE)
    assert mine.status_code == 200
    assert len(mine.data) == 1

    theirs = _client(e.user_b).get(BASE)
    assert len(theirs.data) == 0


def test_manager_approve_applies_the_swap(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    created = _client(e.user_a).post(
        BASE,
        {"requester_assignment": str(a1.id), "counterparty_assignment": str(a2.id)},
        format="json",
    )
    rid = created.data["id"]

    resp = _client(e.user_mgr).post(f"{BASE}{rid}/approve/", {}, format="json")

    assert resp.status_code == 200
    a1.refresh_from_db()
    assert (a1.work_date, a1.shift_id) == (D2, e.shift_day.id)
    # F2: response body must reflect the post-swap state, not the pre-swap state.
    req_asgn = resp.data["requester_assignment"]
    assert req_asgn["work_date"] == D2.isoformat()


def test_employee_cannot_approve(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    created = _client(e.user_a).post(
        BASE,
        {"requester_assignment": str(a1.id), "counterparty_assignment": str(a2.id)},
        format="json",
    )

    resp = _client(e.user_a).post(f"{BASE}{created.data['id']}/approve/", {}, format="json")
    assert resp.status_code == 403


def test_reject_records_the_note(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    created = _client(e.user_a).post(
        BASE,
        {"requester_assignment": str(a1.id), "counterparty_assignment": str(a2.id)},
        format="json",
    )

    resp = _client(e.user_mgr).post(
        f"{BASE}{created.data['id']}/reject/", {"note": "coverage too thin"}, format="json"
    )

    assert resp.status_code == 200
    req = ShiftSwapRequest.all_objects.get(id=created.data["id"])
    assert req.status == "rejected"
    assert req.decision_note == "coverage too thin"
    a1.refresh_from_db()
    assert a1.work_date == D1  # untouched


def test_requester_can_cancel_own_pending_request(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    created = _client(e.user_a).post(
        BASE,
        {"requester_assignment": str(a1.id), "counterparty_assignment": str(a2.id)},
        format="json",
    )

    resp = _client(e.user_a).post(f"{BASE}{created.data['id']}/cancel/", {}, format="json")
    assert resp.status_code == 200
    assert ShiftSwapRequest.all_objects.get(id=created.data["id"]).status == "cancelled"


def test_perm_holder_who_is_not_this_requesters_approver_gets_403(swap_env):
    """Holding schedule:swap:approve:team is not enough — scope is enforced."""
    e = swap_env
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    created = _client(e.user_a).post(
        BASE,
        {"requester_assignment": str(a1.id), "counterparty_assignment": str(a2.id)},
        format="json",
    )

    # An outsider who holds the approve perm but does not manage emp_a.
    from modules.identity.models import Permission, Role, RolePermission, User, UserRole

    outsider = User.objects.create_user(email="out@o.com", password="p!", org_id=e.org.id)
    role = Role.objects.create(org_id=e.org.id, code="r-out", name="R", is_system=False)
    perm, _ = Permission.objects.get_or_create(code="schedule:swap:approve:team")
    RolePermission.objects.create(role=role, permission=perm)
    UserRole.objects.create(user=outsider, role=role)

    resp = _client(outsider).post(f"{BASE}{created.data['id']}/approve/", {}, format="json")

    assert resp.status_code == 403
    a1.refresh_from_db()
    assert a1.work_date == D1  # untouched


def test_manager_cannot_approve_their_own_swap(swap_env):
    """Self-approval guard: resolve_approvers excludes the requester."""
    e = swap_env
    # The manager holds both perms and files a swap of their own.
    from modules.identity.models import Permission, RolePermission, UserRole

    role = UserRole.objects.get(user=e.user_mgr).role
    perm, _ = Permission.objects.get_or_create(code="schedule:swap:request:self")
    RolePermission.objects.get_or_create(role=role, permission=perm)

    a1 = e.make_assignment(e.mgr_emp, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    created = _client(e.user_mgr).post(
        BASE,
        {"requester_assignment": str(a1.id), "counterparty_assignment": str(a2.id)},
        format="json",
    )
    assert created.status_code == 201

    resp = _client(e.user_mgr).post(f"{BASE}{created.data['id']}/approve/", {}, format="json")

    assert resp.status_code == 403
    a1.refresh_from_db()
    assert a1.work_date == D1


def test_other_employee_cannot_cancel(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    created = _client(e.user_a).post(
        BASE,
        {"requester_assignment": str(a1.id), "counterparty_assignment": str(a2.id)},
        format="json",
    )

    resp = _client(e.user_b).post(f"{BASE}{created.data['id']}/cancel/", {}, format="json")
    assert resp.status_code == 403


def test_scope_team_on_retrieve_cannot_leak_another_employees_swap(swap_env):
    """F1 regression: ?scope=team on a retrieve must not bypass the self-scope
    gate and return another employee's swap to a user who only holds
    schedule:swap:request:self (not schedule:swap:approve:team)."""
    e = swap_env
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    created = _client(e.user_a).post(
        BASE,
        {"requester_assignment": str(a1.id), "counterparty_assignment": str(a2.id)},
        format="json",
    )
    assert created.status_code == 201
    swap_id = created.data["id"]

    # user_b holds only schedule:swap:request:self — confirmed by swap_env fixture.
    resp = _client(e.user_b).get(f"{BASE}{swap_id}/?scope=team")

    assert resp.status_code == 404
