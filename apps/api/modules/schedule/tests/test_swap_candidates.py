"""GET /schedule/swap-requests/candidates/ (spec §8)."""

from __future__ import annotations

import datetime as dt

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

# Relative so the suite never expires — validate_pair rejects past dates.
D1 = timezone.localdate() + dt.timedelta(days=14)
D2 = timezone.localdate() + dt.timedelta(days=16)
URL = "/api/v1/schedule/swap-requests/candidates/"


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_lists_other_employees_future_published_shifts(swap_env):
    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)
    theirs = e.make_assignment(e.emp_b, D2, e.shift_day)

    resp = _client(e.user_a).get(f"{URL}?assignment_id={mine.id}")

    assert resp.status_code == 200
    ids = [r["id"] for r in resp.data]
    assert str(theirs.id) in ids
    assert str(mine.id) not in ids


def test_excludes_past_unpublished_and_cancelled(swap_env):
    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)
    past = e.make_assignment(e.emp_b, timezone.localdate() - dt.timedelta(days=2), e.shift_day)
    draft = e.make_assignment(e.emp_b, D2, e.shift_day, published=False)
    cancelled = e.make_assignment(
        e.emp_c, D2 + dt.timedelta(days=2), e.shift_day, status="cancelled"
    )

    resp = _client(e.user_a).get(f"{URL}?assignment_id={mine.id}")

    ids = [r["id"] for r in resp.data]
    for excluded in (past, draft, cancelled):
        assert str(excluded.id) not in ids


def test_does_not_pre_filter_conflicting_candidates(swap_env):
    """Spec §8: conflicts surface as rejections at submit, not by hiding options."""
    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)
    theirs = e.make_assignment(e.emp_b, D2, e.shift_day)
    e.make_assignment(e.emp_a, D2, e.shift_day)  # would block the swap

    resp = _client(e.user_a).get(f"{URL}?assignment_id={mine.id}")

    assert str(theirs.id) in [r["id"] for r in resp.data]


def test_rejects_an_assignment_that_is_not_mine(swap_env):
    """Passing another employee's assignment_id must return 400, not a candidates list."""
    e = swap_env
    not_mine = e.make_assignment(e.emp_b, D1, e.shift_day)

    resp = _client(e.user_a).get(f"{URL}?assignment_id={not_mine.id}")

    assert resp.status_code == 400
    body = resp.json()
    fields = (
        list(body.keys())
        if "assignment_id" in body
        else [err.get("field") for err in body.get("errors", [])]
    )
    assert "assignment_id" in fields


def test_rejects_a_malformed_assignment_id(swap_env):
    """A non-UUID assignment_id must return 400, not 500."""
    e = swap_env

    resp = _client(e.user_a).get(f"{URL}?assignment_id=not-a-uuid")

    assert resp.status_code == 400
