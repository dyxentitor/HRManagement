"""Onboarding invitation system (v1.23.0)."""

import datetime as dt
import hashlib

import pytest
from django.core import mail
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from modules.identity.models import Invitation, Role, User, UserRole
from modules.identity.services import invitation as inv_service
from modules.identity.services.provisioning import provision_user
from modules.organization.models import Organization


@pytest.fixture
def org(db):
    call_command("seed_permission_catalogue")
    o = Organization.objects.create(
        name="T",
        slug="t",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )
    call_command("seed_default_roles", "--org-id", str(o.id))
    return o


@pytest.fixture
def user(org):
    return User.objects.create_user(
        email="newhire@example.com", password="initpass123", org_id=org.id
    )


def _email_text(msg) -> str:
    alt = "".join(a[0] for a in getattr(msg, "alternatives", []) or [])
    return msg.body + alt


def test_create_invitation_hashes_token_and_emails(org, user):
    mail.outbox.clear()
    inv, raw = inv_service.create_invitation(user, created_by=None)
    assert inv.status == "sent"
    assert inv.token_hash == hashlib.sha256(raw.encode()).hexdigest()
    # the raw token is never stored
    assert not Invitation.objects.filter(token_hash=raw).exists()
    assert len(mail.outbox) == 1
    assert raw in _email_text(mail.outbox[0])  # link carries the raw token


def test_invitation_delivered_to_personal_email_not_login(org, user):
    mail.outbox.clear()
    inv, _ = inv_service.create_invitation(user, created_by=None, sent_to="home@gmail.com")
    assert inv.sent_to_email == "home@gmail.com"
    assert mail.outbox[0].to == ["home@gmail.com"]  # delivered to personal, not the login


def test_invitation_falls_back_to_login_when_no_personal(org, user):
    inv, _ = inv_service.create_invitation(user, created_by=None)
    assert inv.sent_to_email == user.email


def test_provision_invite_email_routes_delivery(org):
    mail.outbox.clear()
    u = provision_user(
        org_id=org.id,
        email="company@x.com",
        role_code="employee",
        credential_method="invite",
        invite_email="home@gmail.com",
    )
    inv = Invitation.objects.get(user=u)
    assert inv.sent_to_email == "home@gmail.com"
    assert mail.outbox[-1].to == ["home@gmail.com"]


def test_verify_marks_opened_with_ip(org, user):
    _, raw = inv_service.create_invitation(user, created_by=None)
    got = inv_service.verify(raw, ip="1.2.3.4", ua="Chrome/macOS")
    got.refresh_from_db()
    assert got.status == "opened"
    assert got.opened_ip == "1.2.3.4"
    assert got.opened_user_agent == "Chrome/macOS"


def test_activate_sets_password_and_is_single_use(org, user):
    inv, raw = inv_service.create_invitation(user, created_by=None)
    inv_service.activate(raw, password="brandnewpw1", ip="1.2.3.4")
    user.refresh_from_db()
    assert user.check_password("brandnewpw1")
    assert user.must_change_password is False
    inv.refresh_from_db()
    assert inv.status == "activated"
    with pytest.raises(inv_service.InvalidInvitation):
        inv_service.activate(raw, password="anotherpw12", ip="1.2.3.4")


def test_expired_token_is_blocked(org, user):
    inv, raw = inv_service.create_invitation(user, created_by=None)
    inv.expires_at = timezone.now() - dt.timedelta(hours=1)
    inv.save(update_fields=["expires_at"])
    assert inv.effective_status == "expired"
    with pytest.raises(inv_service.InvalidInvitation):
        inv_service.verify(raw, ip="", ua="")


def test_resend_rotates_token_and_bumps_count(org, user):
    inv, raw = inv_service.create_invitation(user, created_by=None)
    old_hash = inv.token_hash
    new_raw = inv_service.resend(inv, by=None)
    inv.refresh_from_db()
    assert inv.token_hash != old_hash
    assert inv.sent_count == 2
    with pytest.raises(inv_service.InvalidInvitation):
        inv_service.verify(raw, ip="", ua="")  # old link dead
    assert inv_service.verify(new_raw, ip="", ua="").id == inv.id


def test_revoke_blocks_activation(org, user):
    inv, raw = inv_service.create_invitation(user, created_by=None)
    inv_service.revoke(inv, by=None)
    inv.refresh_from_db()
    assert inv.status == "revoked"
    with pytest.raises(inv_service.InvalidInvitation):
        inv_service.verify(raw, ip="", ua="")


def test_provision_invite_creates_invitation(org):
    u = provision_user(
        org_id=org.id,
        email="prov@example.com",
        role_code="employee",
        credential_method="invite",
    )
    assert Invitation.objects.filter(user=u, status="sent").exists()


def _make_user(org, email, role_code):
    u = User.objects.create_user(email=email, password="x", org_id=org.id)
    UserRole.objects.create(user=u, role=Role.objects.get(org_id=org.id, code=role_code))
    return u


@pytest.mark.django_db
def test_employee_invite_action_sends_and_resends(org):
    import datetime as _dt

    from modules.employee.models import Employee
    from modules.organization.models import Department

    dept = Department.all_objects.create(org_id=org.id, name="Eng")
    target = User.objects.create_user(email="newhire2@x.com", password="x", org_id=org.id)
    emp = Employee.all_objects.create(
        org_id=org.id,
        user=target,
        employee_code="E9",
        first_name="New",
        last_name="Hire",
        email="newhire2@x.com",
        department=dept,
        employment_type="fulltime",
        hire_date=_dt.date(2024, 1, 1),
    )
    c = APIClient()
    c.force_authenticate(_make_user(org, "hr2@x.com", "org_admin"))  # has user:create

    # no invitation yet → "sent" + created
    r = c.post(f"/api/v1/employees/{emp.id}/invite/")
    assert r.status_code == 200, r.content
    assert r.json()["status"] == "sent"
    assert Invitation.objects.filter(user_id=target.id, status="sent").exists()

    # second call → "resent"
    r2 = c.post(f"/api/v1/employees/{emp.id}/invite/")
    assert r2.status_code == 200, r2.content
    assert r2.json()["status"] == "resent"


def test_public_verify_and_activate_http(org, user):
    _, raw = inv_service.create_invitation(user, created_by=None)
    c = APIClient()
    r = c.get(f"/api/v1/invitations/verify/?token={raw}")
    assert r.status_code == 200, r.content
    assert r.json()["email"] == "newhire@example.com"
    r = c.post(
        "/api/v1/invitations/activate/",
        {"token": raw, "password": "secretpw1234"},
        format="json",
    )
    assert r.status_code == 200, r.content
    user.refresh_from_db()
    assert user.check_password("secretpw1234")


def test_hr_can_list_and_resend(org, user):
    inv, _ = inv_service.create_invitation(user, created_by=None)
    c = APIClient()
    c.force_authenticate(_make_user(org, "hr@example.com", "org_admin"))
    r = c.get("/api/v1/invitations/")
    assert r.status_code == 200, r.content
    data = r.json()
    rows = data if isinstance(data, list) else data["results"]
    assert any(row["id"] == str(inv.id) for row in rows)
    r = c.post(f"/api/v1/invitations/{inv.id}/resend/")
    assert r.status_code == 200, r.content
    inv.refresh_from_db()
    assert inv.sent_count == 2


def test_non_hr_cannot_list(org, user):
    c = APIClient()
    c.force_authenticate(_make_user(org, "emp2@example.com", "employee"))
    assert c.get("/api/v1/invitations/").status_code == 403


def test_activate_returns_tokens_and_seeds_onboarding(org, user):
    """Phase 2: activate signs the hire in + flags onboarding so the wizard runs."""
    _, raw = inv_service.create_invitation(user, created_by=None)
    c = APIClient()
    r = c.post(
        "/api/v1/invitations/activate/",
        {"token": raw, "password": "secretpw1234"},
        format="json",
    )
    assert r.status_code == 200, r.content
    body = r.json()
    assert body["access_token"] and body["refresh_token"]
    user.refresh_from_db()
    assert user.preferences["onboarding"] == {"completed": False, "step": "profile"}


def test_me_preferences_merges_onboarding(org, user):
    c = APIClient()
    c.force_authenticate(user)
    r = c.patch(
        "/api/v1/me/preferences",
        {"theme": "dark", "onboarding": {"step": "review"}},
        format="json",
    )
    assert r.status_code == 200, r.content
    user.refresh_from_db()
    assert user.preferences["theme"] == "dark"
    # a follow-up patch shallow-merges onboarding (step preserved)
    c.patch("/api/v1/me/preferences", {"onboarding": {"completed": True}}, format="json")
    user.refresh_from_db()
    assert user.preferences["onboarding"] == {"step": "review", "completed": True}
