"""Emitter coverage: leave.cancelled + claim.reimbursed.

These service methods sit on heavy domain graphs (LeaveType/Employee FKs), so we
patch the heavy collaborators and assert the new notify() emission fires with the
right type/priority/recipient. Recipient resolution for leave-cancel is exercised
against the real User table.
"""

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from modules.identity.models import User


@pytest.mark.django_db
def test_leave_cancel_notifies_pending_approver():
    from modules.leave.services import leave_request as svc

    org = uuid.uuid4()
    approver = User.objects.create_user(
        email="appr@x.com", password="x", org_id=org  # pragma: allowlist secret
    )
    request = SimpleNamespace(
        id=uuid.uuid4(),
        org_id=org,
        employee_id=uuid.uuid4(),
        leave_type="AL",
        total_days=1,
        start_date=SimpleNamespace(year=2026),
        save=MagicMock(),
    )

    with (
        patch.object(svc, "WorkflowEngine"),
        patch.object(svc, "BalanceService"),
        patch("modules.leave.models.LeaveApproval") as la,
        patch("modules.notification.services.notify.notify") as notify_mock,
    ):
        la.objects.filter.return_value.values_list.return_value = [approver.id]
        svc.LeaveRequestService.cancel(request, actor=MagicMock())

    assert notify_mock.call_count == 1
    kwargs = notify_mock.call_args.kwargs
    assert kwargs["type"] == "leave.cancelled"
    assert kwargs["priority"] == "normal"
    assert kwargs["user"].id == approver.id


@pytest.mark.django_db
def test_claim_reimbursed_notifies_claimant():
    from modules.claims.services import claim_request as svc

    recipient = User.objects.create_user(
        email="emp@x.com", password="x", org_id=uuid.uuid4()  # pragma: allowlist secret
    )
    claim = SimpleNamespace(
        id=uuid.uuid4(),
        status="finance_approved",
        employee=SimpleNamespace(user=recipient),
        reimbursed_at=None,
        reimbursement_reference=None,
        save=MagicMock(),
    )

    with patch("modules.notification.services.notify.notify") as notify_mock:
        svc.ClaimRequestService.mark_reimbursed(claim, reference="TXN-1", actor_id=uuid.uuid4())

    assert notify_mock.call_count == 1
    kwargs = notify_mock.call_args.kwargs
    assert kwargs["type"] == "claim.reimbursed"
    assert kwargs["priority"] == "normal"
    assert kwargs["user"].id == recipient.id
