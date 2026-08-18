"""Notification side-effects of swap decisions (spec §11)."""

from __future__ import annotations

import datetime as dt

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from modules.notification.models import Notification

pytestmark = pytest.mark.django_db

# Relative so the suite never expires — validate_pair rejects past dates.
D1 = timezone.localdate() + dt.timedelta(days=14)
D2 = timezone.localdate() + dt.timedelta(days=16)
BASE = "/api/v1/schedule/swap-requests/"


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _submit(e):
    a1 = e.make_assignment(e.emp_a, D1, e.shift_night)
    a2 = e.make_assignment(e.emp_b, D2, e.shift_day)
    resp = _client(e.user_a).post(
        BASE,
        {"requester_assignment": str(a1.id), "counterparty_assignment": str(a2.id)},
        format="json",
    )
    return resp.data["id"]


def test_submit_does_not_notify_the_counterparty(swap_env):
    e = swap_env
    _submit(e)
    assert not Notification.objects.filter(
        user=e.user_b, type__startswith="schedule.swap"
    ).exists()


def test_approve_notifies_both_parties(swap_env):
    e = swap_env
    rid = _submit(e)
    _client(e.user_mgr).post(f"{BASE}{rid}/approve/", {}, format="json")

    for user in (e.user_a, e.user_b):
        assert Notification.objects.filter(
            user=user, type="schedule.swap.approved"
        ).exists(), f"missing approval notification for {user.email}"


def test_reject_notifies_only_the_requester(swap_env):
    e = swap_env
    rid = _submit(e)
    _client(e.user_mgr).post(f"{BASE}{rid}/reject/", {"note": "no"}, format="json")

    assert Notification.objects.filter(user=e.user_a, type="schedule.swap.rejected").exists()
    assert not Notification.objects.filter(
        user=e.user_b, type="schedule.swap.rejected"
    ).exists()
