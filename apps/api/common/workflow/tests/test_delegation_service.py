"""ApprovalDelegation model + DelegationService.

Service surface:
    create(delegator, delegate, scope, effective_from, effective_to) -> ApprovalDelegation
    find_active(delegator, scope, on_date) -> ApprovalDelegation | None
    cancel(delegation_id) -> None
    list_for_delegator(delegator) -> list[ApprovalDelegation]
"""

import datetime
import uuid

import pytest

from common.workflow.service import DelegationService
from modules.identity.models import User


@pytest.fixture
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def delegator(org_id: uuid.UUID) -> User:
    return User.objects.create_user(
        email="d@x.com", password="x", org_id=org_id
    )  # pragma: allowlist secret


@pytest.fixture
def delegate(org_id: uuid.UUID) -> User:
    return User.objects.create_user(
        email="x@x.com", password="x", org_id=org_id
    )  # pragma: allowlist secret


@pytest.mark.django_db
def test_create_delegation_basic(delegator: User, delegate: User) -> None:
    d = DelegationService.create(
        delegator=delegator,
        delegate=delegate,
        scope="all",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 7),
    )
    assert d.delegator_id == delegator.id
    assert d.delegate_id == delegate.id
    assert d.scope == "all"
    assert d.cancelled_at is None


@pytest.mark.django_db
def test_create_rejects_self_delegation(delegator: User) -> None:
    with pytest.raises(ValueError):
        DelegationService.create(
            delegator=delegator,
            delegate=delegator,
            scope="leave",
            effective_from=datetime.date(2026, 5, 1),
            effective_to=datetime.date(2026, 5, 7),
        )


@pytest.mark.django_db
def test_create_rejects_inverted_dates(delegator: User, delegate: User) -> None:
    with pytest.raises(ValueError):
        DelegationService.create(
            delegator=delegator,
            delegate=delegate,
            scope="leave",
            effective_from=datetime.date(2026, 5, 7),
            effective_to=datetime.date(2026, 5, 1),
        )


@pytest.mark.django_db
def test_find_active_returns_match_within_window_and_scope(delegator: User, delegate: User) -> None:
    DelegationService.create(
        delegator=delegator,
        delegate=delegate,
        scope="leave",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 7),
    )
    found = DelegationService.find_active(
        delegator, scope="leave", on_date=datetime.date(2026, 5, 3)
    )
    assert found is not None and found.delegate_id == delegate.id


@pytest.mark.django_db
def test_find_active_all_scope_matches_any_specific_scope(delegator: User, delegate: User) -> None:
    DelegationService.create(
        delegator=delegator,
        delegate=delegate,
        scope="all",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 7),
    )
    assert (
        DelegationService.find_active(delegator, scope="leave", on_date=datetime.date(2026, 5, 3))
        is not None
    )
    assert (
        DelegationService.find_active(delegator, scope="claim", on_date=datetime.date(2026, 5, 3))
        is not None
    )


@pytest.mark.django_db
def test_find_active_returns_none_outside_window(delegator: User, delegate: User) -> None:
    DelegationService.create(
        delegator=delegator,
        delegate=delegate,
        scope="leave",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 7),
    )
    assert (
        DelegationService.find_active(delegator, scope="leave", on_date=datetime.date(2026, 4, 30))
        is None
    )
    assert (
        DelegationService.find_active(delegator, scope="leave", on_date=datetime.date(2026, 5, 8))
        is None
    )


@pytest.mark.django_db
def test_find_active_skips_cancelled(delegator: User, delegate: User) -> None:
    d = DelegationService.create(
        delegator=delegator,
        delegate=delegate,
        scope="leave",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 7),
    )
    DelegationService.cancel(d.id)
    assert (
        DelegationService.find_active(delegator, scope="leave", on_date=datetime.date(2026, 5, 3))
        is None
    )


@pytest.mark.django_db
def test_find_active_returns_most_recent_when_overlapping(
    delegator: User, delegate: User, org_id: uuid.UUID
) -> None:
    """If two active delegations overlap, return the most-recently-created."""
    DelegationService.create(
        delegator=delegator,
        delegate=delegate,
        scope="leave",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 10),
    )
    delegate_b = User.objects.create_user(
        email="b@x.com", password="x", org_id=org_id
    )  # pragma: allowlist secret
    DelegationService.create(
        delegator=delegator,
        delegate=delegate_b,
        scope="leave",
        effective_from=datetime.date(2026, 5, 5),
        effective_to=datetime.date(2026, 5, 15),
    )
    found = DelegationService.find_active(
        delegator, scope="leave", on_date=datetime.date(2026, 5, 7)
    )
    assert found.delegate_id == delegate_b.id  # the more recent one


@pytest.mark.django_db
def test_list_for_delegator_returns_all_owned(delegator: User, delegate: User) -> None:
    DelegationService.create(
        delegator=delegator,
        delegate=delegate,
        scope="leave",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 7),
    )
    DelegationService.create(
        delegator=delegator,
        delegate=delegate,
        scope="claim",
        effective_from=datetime.date(2026, 5, 1),
        effective_to=datetime.date(2026, 5, 7),
    )
    rows = DelegationService.list_for_delegator(delegator)
    assert len(rows) == 2
