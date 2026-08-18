"""Execution of an approved swap (spec §5)."""

from __future__ import annotations

import datetime as dt

import pytest
from django.utils import timezone

from modules.schedule.models import ShiftSwapRequest
from modules.schedule.services.swap import SwapValidationError, execute_swap

pytestmark = pytest.mark.django_db

# Relative so the suite never expires — validate_pair rejects past dates.
D1 = timezone.localdate() + dt.timedelta(days=14)
D2 = timezone.localdate() + dt.timedelta(days=16)


def _request(e, a1, a2):
    return ShiftSwapRequest.all_objects.create(
        org_id=e.org.id,
        requester_assignment=a1,
        counterparty_assignment=a2,
        requester=a1.employee,
        counterparty=a2.employee,
    )


def test_cross_date_swap_exchanges_date_and_shift(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    req = _request(e, a1, a2)

    execute_swap(swap_request=req, actor_id=e.user_mgr.id)

    a1.refresh_from_db()
    a2.refresh_from_db()
    # each employee keeps their own row; the slot moved
    assert a1.employee_id == e.emp_a.id
    assert (a1.work_date, a1.shift_id) == (D2, e.shift_day.id)
    assert a2.employee_id == e.emp_b.id
    assert (a2.work_date, a2.shift_id) == (D1, e.shift_night.id)
    assert req.status == "approved"
    assert req.decided_by == e.user_mgr.id
    assert req.decided_at is not None


def test_same_date_day_night_trade(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D1, e.shift_day)
    req = _request(e, a1, a2)

    execute_swap(swap_request=req, actor_id=e.user_mgr.id)

    a1.refresh_from_db()
    a2.refresh_from_db()
    assert (a1.employee_id, a1.work_date, a1.shift_id) == (e.emp_a.id, D1, e.shift_day.id)
    assert (a2.employee_id, a2.work_date, a2.shift_id) == (e.emp_b.id, D1, e.shift_night.id)


def test_swap_clears_covering_for_on_both_rows(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    a1.covering_for = e.emp_c
    a1.save(update_fields=["covering_for"])
    a2.covering_for = e.emp_c
    a2.save(update_fields=["covering_for"])
    req = _request(e, a1, a2)

    execute_swap(swap_request=req, actor_id=e.user_mgr.id)

    a1.refresh_from_db()
    a2.refresh_from_db()
    assert a1.covering_for_id is None
    assert a2.covering_for_id is None
    assert "covering_for" in req.decision_note


def test_reraises_when_roster_changed_after_submit(swap_env):
    """A blocking row created between submit and approve must abort the swap."""
    e = swap_env
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    req = _request(e, a1, a2)
    e.make_assignment(e.emp_a, D2, e.shift_day)  # appears after submit

    with pytest.raises(SwapValidationError, match="already rostered"):
        execute_swap(swap_request=req, actor_id=e.user_mgr.id)

    a1.refresh_from_db()
    assert (a1.work_date, a1.shift_id) == (D1, e.shift_night.id)  # unchanged
    req.refresh_from_db()
    assert req.status == "pending"


def test_rejects_non_pending_request(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    req = _request(e, a1, a2)
    req.status = "rejected"
    req.save(update_fields=["status"])

    with pytest.raises(SwapValidationError, match="pending"):
        execute_swap(swap_request=req, actor_id=e.user_mgr.id)
