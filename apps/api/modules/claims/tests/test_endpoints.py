"""Integration tests for /api/v1/claims/* endpoints."""

import datetime
import os
import uuid
from decimal import Decimal
from unittest import mock

import pytest
from cryptography.fernet import Fernet
from rest_framework.test import APIClient

from modules.claims.models import ClaimAttachment, ClaimCategory, ClaimRequest
from modules.employee.models import Employee
from modules.identity.models import Permission, Role, RolePermission, User, UserRole
from modules.organization.models import Department, Organization


@pytest.fixture(autouse=True)
def _enc_key(monkeypatch: pytest.MonkeyPatch) -> None:
    if not os.environ.get("HRMS_FIELD_ENCRYPTION_KEY"):
        monkeypatch.setenv(
            "HRMS_FIELD_ENCRYPTION_KEY",
            Fernet.generate_key().decode(),  # pragma: allowlist secret
        )


def _login(client: APIClient, email: str, password: str = "x") -> str:  # pragma: allowlist secret
    body = client.post(
        "/api/v1/auth/login",
        {"email": email, "password": password},
        format="json",
    ).json()
    return body["access_token"]


def _grant(role, *codes):
    for code in codes:
        p, _ = Permission.objects.get_or_create(code=code, defaults={"description": ""})
        RolePermission.objects.get_or_create(role=role, permission=p)


@pytest.fixture
def stack():
    org = Organization.objects.create(
        name="X",
        slug="x",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    dept = Department.all_objects.create(org_id=org.id, name="Eng")

    mgr_user = User.objects.create_user(
        email="mgr@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    fin_user = User.objects.create_user(
        email="fin@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )
    emp_user = User.objects.create_user(
        email="emp@x.com",
        password="x",  # pragma: allowlist secret
        org_id=org.id,
    )

    mgr_role = Role.objects.create(org_id=org.id, code="manager", name="Manager", is_system=True)
    fin_role = Role.objects.create(org_id=org.id, code="finance", name="Finance", is_system=True)
    emp_role = Role.objects.create(org_id=org.id, code="employee", name="Employee", is_system=True)

    _grant(
        mgr_role,
        "claim:read:self",
        "claim:read:team",
        "claim:approve:team",
        "claim:approve:finance",
        "claim:cancel:self",
        "claim:create:self",
    )
    _grant(
        fin_role,
        "claim:read:self",
        "claim:read:finance",
        "claim:approve:team",
        "claim:approve:finance",
        "claim:reimburse:finance",
        "claim:create:self",
        "claim:cancel:self",
    )
    _grant(
        emp_role,
        "claim:read:self",
        "claim:create:self",
        "claim:cancel:self",
        "claim:category:write",
    )

    UserRole.objects.create(user=mgr_user, role=mgr_role, granted_by=None)
    UserRole.objects.create(user=fin_user, role=fin_role, granted_by=None)
    UserRole.objects.create(user=emp_user, role=emp_role, granted_by=None)

    def _emp(code, user, manager=None):
        return Employee.all_objects.create(
            org_id=org.id,
            user=user,
            employee_code=code,
            first_name=code,
            last_name="x",
            email=f"{code}@x.com",
            phone="+1",
            date_of_birth=datetime.date(1985, 1, 1),
            gender="other",
            nationality="MY",
            marital_status="single",
            address_line1="x",
            city="x",
            state="x",
            postcode="00000",
            country_code="MY",
            department=dept,
            manager=manager,
            role_title="x",
            employment_type="fulltime",
            hire_date=datetime.date(2024, 1, 1),
            bank_name="x",
            emergency_contact_name="x",
            emergency_contact_relationship="x",
            emergency_contact_phone="+1",
        )

    mgr_emp = _emp("MGR", mgr_user)
    _emp("FIN", fin_user)
    emp_emp = _emp("EMP", emp_user, manager=mgr_emp)

    cat = ClaimCategory.all_objects.create(
        org_id=org.id,
        code="MEAL",
        name="Meals",
        requires_attachment=False,
        currency_code="MYR",
    )

    emp_client = APIClient()
    emp_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(emp_client, 'emp@x.com')}")
    mgr_client = APIClient()
    mgr_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(mgr_client, 'mgr@x.com')}")
    fin_client = APIClient()
    fin_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(fin_client, 'fin@x.com')}")

    return (
        org,
        dept,
        cat,
        emp_user,
        mgr_user,
        fin_user,
        emp_emp,
        mgr_emp,
        emp_client,
        mgr_client,
        fin_client,
    )


@pytest.mark.django_db
def test_list_categories(stack) -> None:
    *_, emp_client, _, _ = stack
    resp = emp_client.get("/api/v1/claims/categories/")
    assert resp.status_code == 200
    body = resp.json()
    rows = body.get("results") if isinstance(body, dict) else body
    assert any(r["code"] == "MEAL" for r in rows)


@pytest.mark.django_db
def test_create_draft_submit_approve_reimburse(stack) -> None:
    """Full happy path: create → submit → mgr approve → fin approve → reimburse."""
    org, _, cat, _, _, _, _, _, emp_client, mgr_client, fin_client = stack

    # 1. Create draft
    resp = emp_client.post(
        "/api/v1/claims/",
        {
            "category": str(cat.id),
            "amount": "123.45",
            "currency_code": "MYR",
            "expense_date": "2026-06-01",
            "description": "Team lunch",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    claim_id = resp.json()["id"]
    assert resp.json()["status"] == "draft"

    # 2. Submit
    resp = emp_client.post(f"/api/v1/claims/{claim_id}/submit/")
    assert resp.status_code == 200, resp.content
    assert resp.json()["status"] == "submitted"

    # 3. Manager approve
    resp = mgr_client.post(
        f"/api/v1/claims/{claim_id}/approve/",
        {"comment": "Looks good"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.json()["status"] == "submitted"  # mid-chain

    # 4. Finance approve
    resp = fin_client.post(
        f"/api/v1/claims/{claim_id}/approve/",
        {"comment": "Approved for payment"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.json()["status"] == "finance_approved"

    # 5. Mark reimbursed
    resp = fin_client.post(
        f"/api/v1/claims/{claim_id}/mark-reimbursed/",
        {"reference": "BANK-9999"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.json()["status"] == "reimbursed"
    assert resp.json()["reimbursement_reference"] == "BANK-9999"


@pytest.mark.django_db
def test_reject_with_comment(stack) -> None:
    _, _, cat, _, _, _, _, _, emp_client, mgr_client, _ = stack

    resp = emp_client.post(
        "/api/v1/claims/",
        {
            "category": str(cat.id),
            "amount": "50.00",
            "currency_code": "MYR",
            "expense_date": "2026-06-01",
            "description": "x",
        },
        format="json",
    )
    assert resp.status_code == 201
    claim_id = resp.json()["id"]

    emp_client.post(f"/api/v1/claims/{claim_id}/submit/")

    resp = mgr_client.post(
        f"/api/v1/claims/{claim_id}/reject/",
        {"comment": "Not a valid expense"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.json()["status"] == "rejected"


@pytest.mark.django_db
def test_reject_without_comment_returns_400(stack) -> None:
    _, _, cat, _, _, _, _, _, emp_client, mgr_client, _ = stack

    resp = emp_client.post(
        "/api/v1/claims/",
        {
            "category": str(cat.id),
            "amount": "50.00",
            "currency_code": "MYR",
            "expense_date": "2026-06-01",
            "description": "x",
        },
        format="json",
    )
    claim_id = resp.json()["id"]
    emp_client.post(f"/api/v1/claims/{claim_id}/submit/")

    resp = mgr_client.post(
        f"/api/v1/claims/{claim_id}/reject/",
        {},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_finance_queue_scope(stack) -> None:
    """finance-queue scope shows only finance_approved claims."""
    org, _, cat, _, _, _, emp_emp, _, emp_client, mgr_client, fin_client = stack

    claim = ClaimRequest.all_objects.create(
        org_id=org.id,
        employee=emp_emp,
        category=cat,
        amount=Decimal("100"),
        currency_code="MYR",
        expense_date=datetime.date(2026, 6, 1),
        description="x",
        status="finance_approved",
    )

    resp = fin_client.get("/api/v1/claims/?scope=finance-queue")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    rows = body.get("results") if isinstance(body, dict) else body
    ids = [r["id"] for r in rows]
    assert str(claim.id) in ids


@pytest.mark.django_db
def test_presigned_upload_smoke(stack) -> None:
    """presigned-upload returns a URL containing the bucket name and s3_key."""
    _, _, cat, _, _, _, emp_emp, _, emp_client, _, _ = stack

    fake_url = "http://minio:9000/hrms/claims/some-uuid/receipt.pdf?X-Amz-Signature=abc"

    with mock.patch(
        "modules.claims.services.attachment.AttachmentService.presigned_upload",
        return_value={
            "presigned_url": fake_url,
            "s3_key": "claims/some-uuid/receipt.pdf",
            "max_size_bytes": 26214400,
        },
    ):
        # Create a claim first
        resp = emp_client.post(
            "/api/v1/claims/",
            {
                "category": str(cat.id),
                "amount": "50.00",
                "currency_code": "MYR",
                "expense_date": "2026-06-01",
                "description": "x",
            },
            format="json",
        )
        assert resp.status_code == 201
        claim_id = resp.json()["id"]

        resp = emp_client.post(
            f"/api/v1/claims/{claim_id}/attachments/presigned-upload/",
            {"filename": "receipt.pdf", "content_type": "application/pdf"},
            format="json",
        )
    assert resp.status_code == 200, resp.content
    data = resp.json()
    assert "presigned_url" in data
    assert "s3_key" in data
    assert "hrms" in data["presigned_url"]


@pytest.mark.django_db
def test_register_attachment(stack) -> None:
    """POST /api/v1/claims/{id}/attachments/ creates a ClaimAttachment row."""
    _, _, cat, _, _, _, _, _, emp_client, _, _ = stack

    resp = emp_client.post(
        "/api/v1/claims/",
        {
            "category": str(cat.id),
            "amount": "50.00",
            "currency_code": "MYR",
            "expense_date": "2026-06-01",
            "description": "x",
        },
        format="json",
    )
    assert resp.status_code == 201
    claim_id = resp.json()["id"]

    s3_key = f"claims/{claim_id}/{uuid.uuid4()}_receipt.pdf"
    resp = emp_client.post(
        f"/api/v1/claims/{claim_id}/attachments/",
        {
            "filename": "receipt.pdf",
            "content_type": "application/pdf",
            "size_bytes": 12345,
            "s3_key": s3_key,
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    assert resp.json()["filename"] == "receipt.pdf"
    assert ClaimAttachment.objects.filter(s3_key=s3_key).count() == 1


@pytest.mark.django_db
def test_download_attachment_returns_presigned_url(stack) -> None:
    """GET .../attachments/{id}/download returns a viewable presigned URL."""
    _, _, cat, _, _, _, _, _, emp_client, _, _ = stack

    claim_id = emp_client.post(
        "/api/v1/claims/",
        {
            "category": str(cat.id),
            "amount": "50.00",
            "currency_code": "MYR",
            "expense_date": "2026-06-01",
            "description": "x",
        },
        format="json",
    ).json()["id"]

    s3_key = f"claims/{claim_id}/{uuid.uuid4()}_receipt.pdf"
    att_id = emp_client.post(
        f"/api/v1/claims/{claim_id}/attachments/",
        {
            "filename": "receipt.pdf",
            "content_type": "application/pdf",
            "size_bytes": 12345,
            "s3_key": s3_key,
        },
        format="json",
    ).json()["id"]

    with mock.patch(
        "modules.claims.services.attachment.AttachmentService.presigned_get",
        return_value="https://minio.example/get?sig=abc",
    ):
        resp = emp_client.get(f"/api/v1/claims/{claim_id}/attachments/{att_id}/download/")

    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["url"] == "https://minio.example/get?sig=abc"
    assert body["filename"] == "receipt.pdf"
