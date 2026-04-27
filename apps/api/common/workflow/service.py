"""DelegationService — CRUD + active-lookup for ApprovalDelegation."""

from __future__ import annotations

import datetime
import uuid
from collections.abc import Iterable

from django.db.models import Q
from django.utils import timezone

from modules.identity.models import User

from .models import ApprovalDelegation


class DelegationService:
    @staticmethod
    def create(
        *,
        delegator: User,
        delegate: User,
        scope: str,
        effective_from: datetime.date,
        effective_to: datetime.date,
    ) -> ApprovalDelegation:
        if delegator.id == delegate.id:
            raise ValueError("Cannot delegate to self")
        if effective_to < effective_from:
            raise ValueError("effective_to must be on or after effective_from")
        if scope not in {"all", "leave", "claim"}:
            raise ValueError(f"Invalid scope: {scope}")
        return ApprovalDelegation.objects.create(
            org_id=delegator.org_id,
            delegator=delegator,
            delegate=delegate,
            scope=scope,
            effective_from=effective_from,
            effective_to=effective_to,
        )

    @staticmethod
    def cancel(delegation_id: uuid.UUID) -> None:
        ApprovalDelegation.objects.filter(id=delegation_id, cancelled_at__isnull=True).update(
            cancelled_at=timezone.now()
        )

    @staticmethod
    def find_active(
        delegator: User,
        scope: str,
        on_date: datetime.date,
    ) -> ApprovalDelegation | None:
        """Return the most-recently-created active delegation for delegator+scope+date.

        'all' scope matches any specific scope (so a delegator who set scope='all'
        will be found by both scope='leave' and scope='claim' lookups).
        """
        scope_filter = Q(scope=scope) | Q(scope="all")
        return (
            ApprovalDelegation.objects.filter(
                scope_filter,
                delegator=delegator,
                cancelled_at__isnull=True,
                effective_from__lte=on_date,
                effective_to__gte=on_date,
            )
            .order_by("-created_at")
            .first()
        )

    @staticmethod
    def list_for_delegator(delegator: User) -> Iterable[ApprovalDelegation]:
        return list(ApprovalDelegation.objects.filter(delegator=delegator).order_by("-created_at"))
