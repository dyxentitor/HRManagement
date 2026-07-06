import uuid
from unittest.mock import patch

import pytest

from modules.identity.models import User


@pytest.mark.django_db
def test_cert_expiring_is_high():
    from modules.certification.services import expiry_scan

    u = User.objects.create_user(
        email="c@x.com", password="x", org_id=uuid.uuid4()  # pragma: allowlist secret
    )

    class _Emp:
        user = u

    class _Cert:
        id = uuid.uuid4()
        employee_id = uuid.uuid4()
        name = "First Aid"
        expires_on = "2026-08-01"

    with (
        patch("modules.notification.services.notify.notify") as m,
        patch("modules.employee.models.Employee.all_objects") as emp_mgr,
    ):
        emp_mgr.filter.return_value.first.return_value = _Emp()
        expiry_scan._notify(_Cert(), days_remaining=10)

    assert m.call_args.kwargs["priority"] == "high"
