"""Pending shift swaps appear in the unified approvals inbox."""

from __future__ import annotations

import datetime as dt

import pytest
from django.utils import timezone

from modules.dashboard.services.inbox import get_inbox
from modules.schedule.models import ShiftSwapRequest

pytestmark = pytest.mark.django_db

# Relative so the suite never expires — validate_pair rejects past dates.
D1 = timezone.localdate() + dt.timedelta(days=14)
D2 = timezone.localdate() + dt.timedelta(days=16)


def _pending(e):
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    return ShiftSwapRequest.all_objects.create(
        org_id=e.org.id,
        requester_assignment=a1,
        counterparty_assignment=a2,
        requester=e.emp_a,
        counterparty=e.emp_b,
        reason="family event",
    )


def test_manager_sees_the_pending_swap(swap_env):
    e = swap_env
    req = _pending(e)

    items = get_inbox(user=e.user_mgr)
    swaps = [i for i in items if i.kind == "shift_swap"]

    assert len(swaps) == 1
    item = swaps[0]
    assert item.id == str(req.id)
    assert item.type_code == "SWAP"
    assert item.employee_code == "E1"
    assert item.detail["counterparty_name"] == e.emp_b.full_name
    assert item.detail["requester_date"] == D1.isoformat()
    assert item.detail["counterparty_date"] == D2.isoformat()
    assert item.detail["reason"] == "family event"


def test_requester_does_not_see_it_in_their_own_inbox(swap_env):
    e = swap_env
    _pending(e)
    items = get_inbox(user=e.user_a)
    assert [i for i in items if i.kind == "shift_swap"] == []


def test_decided_swaps_disappear_from_the_inbox(swap_env):
    e = swap_env
    req = _pending(e)
    req.status = "approved"
    req.save(update_fields=["status"])

    items = get_inbox(user=e.user_mgr)
    assert [i for i in items if i.kind == "shift_swap"] == []
