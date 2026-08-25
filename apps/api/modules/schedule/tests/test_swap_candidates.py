"""GET /schedule/swap-requests/candidates/ (spec §8).

The endpoint is a paged, server-filtered search. Two classes of exclusion:

* **Never returned** — rows no employee could ever swap with (another tenant,
  inactive employee, unpublished, cancelled, past, identical slot, or already
  tied to a pending request).
* **Returned, flagged incompatible** — rows that merely clash with *this*
  requester's roster. Spec §8 keeps these visible so the employee learns why a
  colleague is unavailable instead of watching them silently vanish.

Either way `validate_pair` re-runs at submit, so the list is never an
authorisation.
"""

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


def _get(user, assignment, **params):
    query = "".join(f"&{k}={v}" for k, v in params.items())
    return _client(user).get(f"{URL}?assignment_id={assignment.id}{query}")


def _ids(resp):
    return [r["id"] for r in resp.data["results"]]


def _by_id(resp, assignment):
    return next(r for r in resp.data["results"] if r["id"] == str(assignment.id))


def test_lists_other_employees_future_published_shifts(swap_env):
    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)
    theirs = e.make_assignment(e.emp_b, D2, e.shift_day)

    resp = _get(e.user_a, mine)

    assert resp.status_code == 200
    assert str(theirs.id) in _ids(resp)
    assert str(mine.id) not in _ids(resp)


def test_excludes_past_unpublished_and_cancelled(swap_env):
    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)
    past = e.make_assignment(e.emp_b, timezone.localdate() - dt.timedelta(days=2), e.shift_day)
    draft = e.make_assignment(e.emp_b, D2, e.shift_day, published=False)
    cancelled = e.make_assignment(
        e.emp_c, D2 + dt.timedelta(days=2), e.shift_day, status="cancelled"
    )

    resp = _get(e.user_a, mine)

    ids = _ids(resp)
    for excluded in (past, draft, cancelled):
        assert str(excluded.id) not in ids


def test_returns_conflicting_candidates_flagged_incompatible(swap_env):
    """Spec §8: a clash is explained on the card, not hidden from the list."""
    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)
    theirs = e.make_assignment(e.emp_b, D2, e.shift_day)
    e.make_assignment(e.emp_a, D2, e.shift_day)  # requester already rostered on D2

    resp = _get(e.user_a, mine)

    row = _by_id(resp, theirs)
    assert row["compatible"] is False
    assert "already rostered" in row["incompatible_reason"]


def test_marks_a_clean_candidate_compatible(swap_env):
    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)
    theirs = e.make_assignment(e.emp_b, D2, e.shift_day)

    row = _by_id(_get(e.user_a, mine), theirs)

    assert row["compatible"] is True
    assert row["incompatible_reason"] is None


def test_compatible_candidates_are_ranked_first(swap_env):
    """Page 1 must be useful — clashing rows sink below clean ones."""
    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)
    # emp_b's shift clashes (requester already rostered that day); emp_c's is clean.
    clashing = e.make_assignment(e.emp_b, D2, e.shift_day)
    e.make_assignment(e.emp_a, D2, e.shift_day)
    clean = e.make_assignment(e.emp_c, D2 + dt.timedelta(days=1), e.shift_day)

    ids = _ids(_get(e.user_a, mine))

    assert ids.index(str(clean.id)) < ids.index(str(clashing.id))


def test_excludes_rows_already_tied_to_a_pending_request(swap_env):
    from modules.schedule.models import ShiftSwapRequest

    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)
    spoken_for = e.make_assignment(e.emp_b, D2, e.shift_day)
    free = e.make_assignment(e.emp_c, D2 + dt.timedelta(days=1), e.shift_day)
    other = e.make_assignment(e.emp_c, D2 + dt.timedelta(days=3), e.shift_day)
    ShiftSwapRequest.all_objects.create(
        org_id=e.org.id,
        requester_assignment=spoken_for,
        counterparty_assignment=other,
        requester=e.emp_b,
        counterparty=e.emp_c,
        status="pending",
    )

    ids = _ids(_get(e.user_a, mine))

    assert str(spoken_for.id) not in ids
    assert str(free.id) in ids


def test_reports_blocked_reason_when_own_shift_has_a_pending_swap(swap_env):
    from modules.schedule.models import ShiftSwapRequest

    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)
    theirs = e.make_assignment(e.emp_b, D2, e.shift_day)
    ShiftSwapRequest.all_objects.create(
        org_id=e.org.id,
        requester_assignment=mine,
        counterparty_assignment=theirs,
        requester=e.emp_a,
        counterparty=e.emp_b,
        status="pending",
    )

    resp = _get(e.user_a, mine)

    assert resp.data["blocked_reason"] is not None


def test_excludes_the_identical_slot(swap_env):
    """Same date and same shift is a no-op, not a swap."""
    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_day)
    same_slot = e.make_assignment(e.emp_b, D1, e.shift_day)

    assert str(same_slot.id) not in _ids(_get(e.user_a, mine))


# --------------------------------------------------------------------------
# Paging, search and filters — the reason the browser never sees a whole roster
# --------------------------------------------------------------------------


def test_pages_results_and_reports_the_total_count(swap_env):
    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)
    for i in range(5):
        e.make_assignment(e.emp_b, D2 + dt.timedelta(days=i), e.shift_day)

    first = _get(e.user_a, mine, page_size=2)
    second = _get(e.user_a, mine, page_size=2, page=2)

    assert first.data["count"] == 5
    assert len(first.data["results"]) == 2
    assert len(second.data["results"]) == 2
    # Pages must not overlap.
    assert set(_ids(first)).isdisjoint(_ids(second))


def test_searches_by_name_and_employee_code(swap_env):
    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)
    b_shift = e.make_assignment(e.emp_b, D2, e.shift_day)
    c_shift = e.make_assignment(e.emp_c, D2 + dt.timedelta(days=1), e.shift_day)

    by_code = _ids(_get(e.user_a, mine, q="E2"))
    assert str(b_shift.id) in by_code
    assert str(c_shift.id) not in by_code

    # emp_c's first_name is "C" — one char, below the minimum, so it is ignored
    # and the unfiltered list comes back rather than a misleading empty one.
    assert len(_ids(_get(e.user_a, mine, q="C"))) == 2


def test_filters_by_shift_and_date_range(swap_env):
    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)
    day_shift = e.make_assignment(e.emp_b, D2, e.shift_day)
    night_shift = e.make_assignment(e.emp_c, D2 + dt.timedelta(days=1), e.shift_night)

    by_shift = _ids(_get(e.user_a, mine, shift=e.shift_night.id))
    assert by_shift == [str(night_shift.id)]

    by_date = _ids(_get(e.user_a, mine, date_from=D2, date_to=D2))
    assert by_date == [str(day_shift.id)]


def test_rejects_a_malformed_filter_value(swap_env):
    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)

    assert _get(e.user_a, mine, shift="not-a-uuid").status_code == 400
    assert _get(e.user_a, mine, date_from="31-12-2026").status_code == 400


def test_candidate_search_does_not_scale_queries_with_result_count(
    swap_env, django_assert_max_num_queries
):
    """Guards the N+1 the batched compatibility evaluator exists to prevent."""
    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)
    for i in range(12):
        e.make_assignment(e.emp_b, D2 + dt.timedelta(days=i), e.shift_day)

    with django_assert_max_num_queries(15):
        resp = _get(e.user_a, mine, page_size=12)

    assert len(resp.data["results"]) == 12


# --------------------------------------------------------------------------
# Tenant isolation
# --------------------------------------------------------------------------


def _second_org(slug, code, email, phone, phone2):
    """A rival tenant with one employee and one published future shift."""
    from conftest import _make_employee
    from modules.organization.models import Department, Organization
    from modules.schedule.models import Shift, ShiftAssignment

    org = Organization.objects.create(
        slug=slug,
        name="Other Co",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
        status="active",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Ops")
    intruder = _make_employee(
        org,
        dept,
        employee_code=code,
        first_name="Intruder",
        email=email,
        phone=phone,
        emergency_contact_phone=phone2,
    )
    shift = Shift.all_objects.create(
        org_id=org.id, name="Day", code="D", start_time=dt.time(9), end_time=dt.time(18)
    )
    assignment = ShiftAssignment.all_objects.create(
        org_id=org.id,
        employee=intruder,
        shift=shift,
        work_date=D2,
        status="scheduled",
        assigned_by=intruder.id,
        published_at=timezone.now(),
    )
    return assignment


def test_never_returns_another_tenants_employees_or_shifts(swap_env):
    """Critical: a rival org's roster must be invisible, not merely unswappable."""
    e = swap_env
    mine = e.make_assignment(e.emp_a, D1, e.shift_night)
    same_org_peer = e.make_assignment(e.emp_b, D2, e.shift_day)
    foreign = _second_org("other", "X1", "x@x.com", "+60100000077", "+60100000078")

    resp = _get(e.user_a, mine)

    ids = _ids(resp)
    assert str(same_org_peer.id) in ids
    assert str(foreign.id) not in ids
    # Belt and braces: no field of any row may leak the rival tenant's people.
    assert "Intruder" not in str(resp.data)


def test_cannot_use_another_tenants_assignment_as_the_source(swap_env):
    """Passing a foreign assignment_id must 400, never enumerate that org."""
    e = swap_env
    foreign = _second_org("other2", "X2", "x2@x.com", "+60100000079", "+60100000080")

    resp = _client(e.user_a).get(f"{URL}?assignment_id={foreign.id}")

    assert resp.status_code == 400


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
