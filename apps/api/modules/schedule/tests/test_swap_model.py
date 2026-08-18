"""Model-level tests for ShiftSwapRequest."""

from __future__ import annotations

import datetime as dt

import pytest

from modules.schedule.models import ShiftSwapRequest

pytestmark = pytest.mark.django_db


def test_swap_request_defaults_to_pending(swap_env):
    e = swap_env
    d1 = dt.date(2026, 9, 1)
    d2 = dt.date(2026, 9, 3)
    a1 = e.make_assignment(e.emp_a, d1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, d2, e.shift_day)

    req = ShiftSwapRequest.all_objects.create(
        org_id=e.org.id,
        requester_assignment=a1,
        counterparty_assignment=a2,
        requester=e.emp_a,
        counterparty=e.emp_b,
        reason="family event",
    )

    assert req.status == "pending"
    assert req.decided_by is None
    assert req.decided_at is None
    assert req.decision_note == ""
    assert str(req) == "E1 <-> E2 (pending)"
