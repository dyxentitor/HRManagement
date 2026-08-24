"""GET/PUT /api/v1/org/notification-routing/"""

import json

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.notification.models import NotificationRouting
from modules.notification.registry import REGISTRY
from modules.organization.models import Organization

pytestmark = pytest.mark.django_db

URL = "/api/v1/org/notification-routing/"


@pytest.fixture
def org():
    return Organization.objects.create(
        name="Provintell",
        slug="provintell",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def org_id(org):
    return org.id


def _client(org, email, perms):
    user = User.objects.create_user(
        email=email,
        password="x",
        org_id=org.id,  # pragma: allowlist secret
    )
    role = Role.objects.create(org_id=org.id, code=f"role-{email}", name="R", is_system=True)
    for code in perms:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.create(role=role, permission=p)
    UserRole.objects.create(user=user, role=role, granted_by=None)
    c = APIClient()
    tok = c.post(
        "/api/v1/auth/login",
        {"email": email, "password": "x"},  # pragma: allowlist secret
        format="json",
    ).json()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {tok['access_token']}")
    return c


@pytest.fixture
def admin_client(org):
    return _client(org, "admin@e.com", ["org:email_config:read", "org:email_config:write"])


@pytest.fixture
def read_only_client(org):
    return _client(org, "readonly@e.com", ["org:email_config:read"])


@pytest.fixture
def employee_client(org):
    return _client(org, "employee@e.com", [])


def _put(client, payload):
    # NB: DRF's APIClient only auto-serializes to JSON when `format="json"` is
    # used. Passing `content_type="application/json"` explicitly (as this
    # endpoint's payload is a bare list, which `format="json"` handles fine
    # too, but the brief specifies content_type) makes APIRequestFactory treat
    # `data` as an already-encoded bytestring (`force_bytes`) rather than
    # rendering it — a raw Python list would come out as its repr() (single
    # quotes), which is invalid JSON. Pre-serializing here keeps
    # content_type="application/json" while sending valid JSON.
    return client.put(URL, data=json.dumps(payload), content_type="application/json")


def test_url_resolves_at_the_documented_path():
    # The whole API is mounted under the "v1" namespace in hrms_api/urls.py
    # (`include((api_v1_patterns, "v1"))`), so every named URL in this project
    # reverses as "v1:<name>" — confirmed true for pre-existing names too
    # (e.g. "v1:email-config", "v1:notification-list"). The name itself is
    # still "notification-routing" per the brief's Interfaces section.
    assert reverse("v1:notification-routing") == URL


def test_get_returns_every_registry_type(admin_client):
    res = admin_client.get(URL)
    assert res.status_code == 200
    assert len(res.json()) == len(REGISTRY)


def test_get_row_shape(admin_client):
    rows = {r["type"]: r for r in admin_client.get(URL).json()}
    row = rows["leave.approved"]
    assert row["label"] == "Leave request approved"
    assert row["domain"] == "leave"
    assert row["domain_label"] == "Leave"
    assert row["security"] is False
    assert row["sensitive_content"] is True
    assert row["in_app_enabled"] is True
    assert row["email_enabled"] is True
    assert row["delivery"] == "auto"
    assert row["cc_entries"] == []
    assert {"token": "{approver}", "label": "Approver"} in row["available_tokens"]


def test_get_merges_stored_rows_over_defaults(admin_client, org_id):
    NotificationRouting.objects.create(
        org_id=org_id,
        type="leave.approved",
        delivery="immediate",
        cc_entries=["hr@provintell.com"],
    )
    rows = {r["type"]: r for r in admin_client.get(URL).json()}
    assert rows["leave.approved"]["delivery"] == "immediate"
    assert rows["leave.approved"]["cc_entries"] == ["hr@provintell.com"]
    assert rows["leave.rejected"]["delivery"] == "auto"


def test_put_upserts_rows(admin_client, org_id):
    res = _put(
        admin_client,
        [
            {
                "type": "leave.approved",
                "in_app_enabled": True,
                "email_enabled": True,
                "delivery": "auto",
                "cc_entries": ["hr@provintell.com", "{approver}"],
            }
        ],
    )
    assert res.status_code == 200
    row = NotificationRouting.objects.get(org_id=org_id, type="leave.approved")
    assert row.cc_entries == ["hr@provintell.com", "{approver}"]


def test_put_is_idempotent_and_does_not_duplicate(admin_client, org_id):
    payload = [
        {
            "type": "leave.approved",
            "in_app_enabled": True,
            "email_enabled": True,
            "delivery": "auto",
            "cc_entries": ["hr@provintell.com"],
        }
    ]
    _put(admin_client, payload)
    _put(admin_client, payload)
    assert NotificationRouting.objects.filter(org_id=org_id, type="leave.approved").count() == 1


def test_put_returns_the_full_merged_list(admin_client):
    res = _put(
        admin_client,
        [
            {
                "type": "leave.approved",
                "in_app_enabled": True,
                "email_enabled": True,
                "delivery": "auto",
                "cc_entries": [],
            }
        ],
    )
    assert len(res.json()) == len(REGISTRY)


def test_put_rejects_an_unknown_type(admin_client):
    res = _put(
        admin_client,
        [
            {
                "type": "made.up",
                "in_app_enabled": True,
                "email_enabled": True,
                "delivery": "auto",
                "cc_entries": [],
            }
        ],
    )
    assert res.status_code == 400


def test_put_rejects_a_malformed_email(admin_client):
    res = _put(
        admin_client,
        [
            {
                "type": "leave.approved",
                "in_app_enabled": True,
                "email_enabled": True,
                "delivery": "auto",
                "cc_entries": ["not-an-email"],
            }
        ],
    )
    assert res.status_code == 400


def test_put_rejects_a_token_the_type_cannot_bind(admin_client):
    res = _put(
        admin_client,
        [
            {
                "type": "payslip.published",
                "in_app_enabled": True,
                "email_enabled": True,
                "delivery": "auto",
                "cc_entries": ["{approver}"],
            }
        ],
    )
    assert res.status_code == 400


def test_put_rejects_cc_on_the_digest_lane(admin_client):
    res = _put(
        admin_client,
        [
            {
                "type": "leave.approved",
                "in_app_enabled": True,
                "email_enabled": True,
                "delivery": "digest",
                "cc_entries": ["hr@provintell.com"],
            }
        ],
    )
    assert res.status_code == 400


def test_put_allows_digest_lane_with_no_cc(admin_client):
    res = _put(
        admin_client,
        [
            {
                "type": "leave.approved",
                "in_app_enabled": True,
                "email_enabled": True,
                "delivery": "digest",
                "cc_entries": [],
            }
        ],
    )
    assert res.status_code == 200


def test_put_rejects_disabling_email_on_a_security_type(admin_client):
    res = _put(
        admin_client,
        [
            {
                "type": "auth.password_changed",
                "in_app_enabled": True,
                "email_enabled": False,
                "delivery": "auto",
                "cc_entries": [],
            }
        ],
    )
    assert res.status_code == 400


def test_put_allows_cc_on_a_security_type(admin_client):
    res = _put(
        admin_client,
        [
            {
                "type": "auth.password_changed",
                "in_app_enabled": True,
                "email_enabled": True,
                "delivery": "auto",
                "cc_entries": ["soc@provintell.com"],
            }
        ],
    )
    assert res.status_code == 200


def test_put_writes_one_audit_row(admin_client, org_id):
    from common.audit.models import AuditLog

    before = AuditLog.objects.filter(action="notification_routing.updated").count()
    _put(
        admin_client,
        [
            {
                "type": "leave.approved",
                "in_app_enabled": True,
                "email_enabled": True,
                "delivery": "auto",
                "cc_entries": ["hr@provintell.com"],
            }
        ],
    )
    after = AuditLog.objects.filter(action="notification_routing.updated").count()
    assert after == before + 1


def test_get_denied_without_permission(employee_client):
    assert employee_client.get(URL).status_code == 403


def test_put_denied_with_read_only_permission(read_only_client):
    res = _put(
        read_only_client,
        [
            {
                "type": "leave.approved",
                "in_app_enabled": True,
                "email_enabled": True,
                "delivery": "auto",
                "cc_entries": [],
            }
        ],
    )
    assert res.status_code == 403
