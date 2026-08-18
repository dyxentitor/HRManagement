"""Approver routing for shift swaps (spec §7)."""

from __future__ import annotations

import pytest

from modules.schedule.services.swap import resolve_approvers

pytestmark = pytest.mark.django_db


def test_routes_to_the_requesters_manager(swap_env):
    e = swap_env
    approvers = resolve_approvers(requester=e.emp_a)
    assert [u.id for u in approvers] == [e.user_mgr.id]


def test_falls_back_to_permission_pool_when_no_manager(swap_env):
    """emp_c has no manager — fall back to anyone holding the approve perm."""
    e = swap_env
    approvers = resolve_approvers(requester=e.emp_c)
    assert e.user_mgr.id in [u.id for u in approvers]


def test_never_returns_the_requester(swap_env):
    """A manager who can approve must not approve their own swap."""
    e = swap_env
    approvers = resolve_approvers(requester=e.mgr_emp)
    assert e.user_mgr.id not in [u.id for u in approvers]


def test_falls_back_to_pool_when_manager_lacks_the_approve_perm(swap_env):
    """A manager without the approve perm must not short-circuit the pool."""
    from modules.identity.models import User

    e = swap_env
    # Create a fresh user+employee who is emp_b's manager but holds NO perms.
    user_no_perm = User.objects.create_user(email="noperm@test.com", password="p!", org_id=e.org.id)
    mgr_no_perm = e.emp_c  # emp_c has no linked user — attach the new one
    mgr_no_perm.user = user_no_perm
    mgr_no_perm.save(update_fields=["user"])

    e.emp_b.manager = mgr_no_perm
    e.emp_b.save(update_fields=["manager"])

    approvers = resolve_approvers(requester=e.emp_b)

    # Fell through to the pool, which contains the perm-holding user_mgr.
    assert e.user_mgr.id in [u.id for u in approvers]
