"""Validation rules for shift swaps (spec §6)."""

from __future__ import annotations

import datetime as dt

import pytest
from django.utils import timezone

from modules.schedule.models import ShiftSwapRequest
from modules.schedule.services.swap import SwapValidationError, validate_pair

pytestmark = pytest.mark.django_db

FUTURE_1 = dt.date(2026, 9, 1)
FUTURE_2 = dt.date(2026, 9, 3)


def test_cross_date_swap_is_valid(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, FUTURE_1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, FUTURE_2, e.shift_day)
    validate_pair(requester_assignment=a1, counterparty_assignment=a2, requester=e.emp_a)


def test_same_date_day_night_trade_is_valid(swap_env):
    """Same-date trades are structurally exempt from the conflict rule."""
    e = swap_env
    a1 = e.make_assignment(e.emp_a, FUTURE_1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, FUTURE_1, e.shift_day)
    validate_pair(requester_assignment=a1, counterparty_assignment=a2, requester=e.emp_a)


def test_rejects_when_requester_does_not_own_the_assignment(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_b, FUTURE_1, e.shift_night)
    a2 = e.make_assignment(e.emp_c, FUTURE_2, e.shift_day)
    with pytest.raises(SwapValidationError, match="your own shift"):
        validate_pair(requester_assignment=a1, counterparty_assignment=a2, requester=e.emp_a)


def test_rejects_swap_with_self(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, FUTURE_1, e.shift_night)
    a2 = e.make_assignment(e.emp_a, FUTURE_2, e.shift_day)
    with pytest.raises(SwapValidationError, match="yourself"):
        validate_pair(requester_assignment=a1, counterparty_assignment=a2, requester=e.emp_a)


def test_rejects_identical_slot(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, FUTURE_1, e.shift_day)
    a2 = e.make_assignment(e.emp_b, FUTURE_1, e.shift_day)
    with pytest.raises(SwapValidationError, match="already the same"):
        validate_pair(requester_assignment=a1, counterparty_assignment=a2, requester=e.emp_a)


def test_rejects_past_date(swap_env):
    e = swap_env
    past = timezone.localdate() - dt.timedelta(days=1)
    a1 = e.make_assignment(e.emp_a, past, e.shift_night)
    a2 = e.make_assignment(e.emp_b, FUTURE_2, e.shift_day)
    with pytest.raises(SwapValidationError, match="future"):
        validate_pair(requester_assignment=a1, counterparty_assignment=a2, requester=e.emp_a)


def test_rejects_unpublished_assignment(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, FUTURE_1, e.shift_night, published=False)
    a2 = e.make_assignment(e.emp_b, FUTURE_2, e.shift_day)
    with pytest.raises(SwapValidationError, match="published"):
        validate_pair(requester_assignment=a1, counterparty_assignment=a2, requester=e.emp_a)


def test_rejects_non_scheduled_status(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, FUTURE_1, e.shift_night, status="cancelled")
    a2 = e.make_assignment(e.emp_b, FUTURE_2, e.shift_day)
    with pytest.raises(SwapValidationError, match="scheduled"):
        validate_pair(requester_assignment=a1, counterparty_assignment=a2, requester=e.emp_a)


def test_rejects_conflict_naming_the_blocking_date_and_shift(swap_env):
    """Requester already rostered on the counterparty's date."""
    e = swap_env
    a1 = e.make_assignment(e.emp_a, FUTURE_1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, FUTURE_2, e.shift_day)
    e.make_assignment(e.emp_a, FUTURE_2, e.shift_day)  # the blocker
    with pytest.raises(SwapValidationError) as exc:
        validate_pair(requester_assignment=a1, counterparty_assignment=a2, requester=e.emp_a)
    assert "2026-09-03" in exc.value.message
    assert "Day" in exc.value.message


def test_rejects_conflict_on_counterparty_side(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, FUTURE_1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, FUTURE_2, e.shift_day)
    e.make_assignment(e.emp_b, FUTURE_1, e.shift_day)  # blocker on B's side
    with pytest.raises(SwapValidationError, match="E2"):
        validate_pair(requester_assignment=a1, counterparty_assignment=a2, requester=e.emp_a)


def test_rejects_duplicate_pending_request(swap_env):
    e = swap_env
    a1 = e.make_assignment(e.emp_a, FUTURE_1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, FUTURE_2, e.shift_day)
    ShiftSwapRequest.all_objects.create(
        org_id=e.org.id,
        requester_assignment=a1,
        counterparty_assignment=a2,
        requester=e.emp_a,
        counterparty=e.emp_b,
    )
    with pytest.raises(SwapValidationError, match="pending swap"):
        validate_pair(requester_assignment=a1, counterparty_assignment=a2, requester=e.emp_a)
