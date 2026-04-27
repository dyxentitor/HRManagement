"""ApprovalDelegation model — user-level delegation records consumed by the workflow engine."""

from __future__ import annotations

import uuid
from typing import ClassVar

from django.db import models
from django.utils import timezone


class ApprovalDelegation(models.Model):
    """A delegator hands their approval authority to a delegate for a date window + scope.

    Scopes: 'all' (any approval kind), 'leave', 'claim' (extend as more
    approval-bearing modules ship). The workflow engine's routing function
    consults this table when resolving the effective approver.
    """

    SCOPE_CHOICES: ClassVar[tuple] = (
        ("all", "All"),
        ("leave", "Leave"),
        ("claim", "Claim"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org_id = models.UUIDField(db_index=True)
    delegator = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="approval_delegations_as_delegator",
    )
    delegate = models.ForeignKey(
        "identity.User",
        on_delete=models.CASCADE,
        related_name="approval_delegations_as_delegate",
    )
    scope = models.CharField(max_length=8, choices=SCOPE_CHOICES)
    effective_from = models.DateField()
    effective_to = models.DateField()
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "workflow_approval_delegation"
        indexes: ClassVar[list] = [
            models.Index(fields=["delegator", "effective_from", "effective_to"]),
            models.Index(fields=["org_id"]),
        ]

    def __str__(self) -> str:
        return (
            f"{self.delegator_id} -> {self.delegate_id}"
            f" [{self.scope}] {self.effective_from}..{self.effective_to}"
        )
