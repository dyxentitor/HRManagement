"""Emitter coverage: payslip.published + incentive.claim_submitted.

Both sit on heavy service/view bodies (S3, PDF, ledger, eligibility), so we patch
the heavy collaborators and assert the new notify() emission fires with the right
type/priority/recipient against the real User table.
"""

import datetime
import uuid
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from modules.identity.models import User


@pytest.mark.django_db
def test_payslip_publish_notifies_employee():
    from modules.payslip.services import publish as pub

    user = User.objects.create_user(
        email="e@x.com", password="x", org_id=uuid.uuid4()  # pragma: allowlist secret
    )
    ps = SimpleNamespace(
        id=uuid.uuid4(),
        employee_id=uuid.uuid4(),
        period=SimpleNamespace(
            period_start=datetime.date(2026, 6, 1), period_end=datetime.date(2026, 6, 30)
        ),
        gross=Decimal("100"),
        net=Decimal("90"),
        currency_code="MYR",
        pdf_s3_key=None,
        pdf_generated_at=None,
        status="draft",
        published_at=None,
        save=MagicMock(),
    )
    emp = SimpleNamespace(employee_code="E1", user=user)
    run = SimpleNamespace(
        status="validated",
        org_id=uuid.uuid4(),
        period_id=uuid.uuid4(),
        period=SimpleNamespace(
            status="open",
            period_start=datetime.date(2026, 6, 1),
            completed_at=None,
            save=MagicMock(),
        ),
        published_at=None,
        save=MagicMock(),
    )

    with (
        patch.object(pub, "Organization") as org_model,
        patch.object(pub, "_s3"),
        patch.object(pub, "_bucket", return_value="b"),
        patch.object(pub, "PayslipRecord") as pr,
        patch.object(pub, "Employee") as emp_model,
        patch.object(pub, "render_payslip_pdf", return_value=b"x"),
        patch.object(pub, "append"),
        patch.object(pub, "append_payroll"),
        patch("modules.notification.services.notify.notify") as notify_mock,
    ):
        org_model.objects.get.return_value = SimpleNamespace(slug="x")
        pr.all_objects.filter.return_value = [ps]
        emp_model.all_objects.get.return_value = emp
        pub.publish_run(run=run, actor_id=uuid.uuid4())

    assert notify_mock.call_count == 1
    kwargs = notify_mock.call_args.kwargs
    assert kwargs["type"] == "payslip.published"
    assert kwargs["priority"] == "normal"
    assert kwargs["user"].id == user.id


@pytest.mark.django_db
def test_incentive_submit_notifies_manager():
    from modules.incentive.views import ClaimViewSet

    org = uuid.uuid4()
    mgr_user = User.objects.create_user(
        email="mgr@x.com", password="x", org_id=org  # pragma: allowlist secret
    )
    view = ClaimViewSet()
    view.request = SimpleNamespace(user=SimpleNamespace(org_id=org, id=uuid.uuid4()))
    project = SimpleNamespace(manager_id=uuid.uuid4(), name="Alpha")
    serializer = MagicMock()
    serializer.validated_data = {"project": project}
    serializer.save.return_value = SimpleNamespace(id=uuid.uuid4(), mandays=3)

    with (
        patch("modules.incentive.views._employee", return_value=SimpleNamespace(id=uuid.uuid4())),
        patch("modules.incentive.views.ledger") as led,
        patch("modules.employee.models.Employee.all_objects") as emp_mgr,
        patch("modules.notification.services.notify.notify") as notify_mock,
    ):
        led.can_see_project.return_value = True
        led.eligible.return_value = True
        emp_mgr.filter.return_value.first.return_value = SimpleNamespace(user=mgr_user)
        view.perform_create(serializer)

    assert notify_mock.call_count == 1
    kwargs = notify_mock.call_args.kwargs
    assert kwargs["type"] == "incentive.claim_submitted"
    assert kwargs["priority"] == "high"
    assert kwargs["user"].id == mgr_user.id
