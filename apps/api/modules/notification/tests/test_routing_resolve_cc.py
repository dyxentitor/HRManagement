"""CC entry resolution: literals, tokens, dedupe."""

import pytest

from modules.identity.models import Role, User, UserRole
from modules.notification.models import Notification, NotificationRouting
from modules.notification.services.routing import (
    available_tokens,
    is_valid_token,
    resolve_cc,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def org_id(db):
    import uuid

    return uuid.uuid4()


def _user(org_id, email, **kw):
    return User.objects.create(org_id=org_id, email=email, is_active=True, **kw)


def _notification(org_id, user, type_code="leave.approved", cc_context=None):
    return Notification.objects.create(
        org_id=org_id,
        user=user,
        type=type_code,
        channel="email",
        payload={},
        cc_context=cc_context or {},
    )


def _route(org_id, type_code, cc_entries):
    return NotificationRouting.objects.create(
        org_id=org_id, type=type_code, cc_entries=cc_entries, delivery="auto"
    )


def _grant_role(org_id, user, code):
    role, _ = Role.objects.get_or_create(org_id=org_id, code=code, defaults={"name": code})
    UserRole.objects.create(user=user, role=role)


def test_no_routing_row_yields_no_cc(org_id):
    emp = _user(org_id, "emp@provintell.com")
    assert resolve_cc(_notification(org_id, emp)) == []


def test_empty_cc_entries_yields_no_cc(org_id):
    emp = _user(org_id, "emp@provintell.com")
    _route(org_id, "leave.approved", [])
    assert resolve_cc(_notification(org_id, emp)) == []


def test_literal_addresses_resolve_in_order(org_id):
    emp = _user(org_id, "emp@provintell.com")
    _route(org_id, "leave.approved", ["a@provintell.com", "b@provintell.com"])
    assert resolve_cc(_notification(org_id, emp)) == ["a@provintell.com", "b@provintell.com"]


def test_approver_context_token_resolves(org_id):
    emp = _user(org_id, "emp@provintell.com")
    appr = _user(org_id, "boss@provintell.com")
    _route(org_id, "leave.approved", ["{approver}"])
    n = _notification(org_id, emp, cc_context={"approver": str(appr.id)})
    assert resolve_cc(n) == ["boss@provintell.com"]


def test_requester_context_token_resolves(org_id):
    appr = _user(org_id, "boss@provintell.com")
    emp = _user(org_id, "emp@provintell.com")
    _route(org_id, "leave.submitted", ["{requester}"])
    n = _notification(
        org_id, appr, type_code="leave.submitted", cc_context={"requester": str(emp.id)}
    )
    assert resolve_cc(n) == ["emp@provintell.com"]


def test_role_token_resolves_to_active_role_holders(org_id):
    emp = _user(org_id, "emp@provintell.com")
    hr1 = _user(org_id, "hr1@provintell.com")
    hr2 = _user(org_id, "hr2@provintell.com")
    _grant_role(org_id, hr1, "hr_manager")
    _grant_role(org_id, hr2, "hr_manager")
    _route(org_id, "leave.approved", ["{hr_managers}"])
    assert sorted(resolve_cc(_notification(org_id, emp))) == [
        "hr1@provintell.com",
        "hr2@provintell.com",
    ]


def test_missing_context_binding_drops_the_token_silently(org_id):
    emp = _user(org_id, "emp@provintell.com")
    _route(org_id, "leave.approved", ["{approver}", "a@provintell.com"])
    n = _notification(org_id, emp, cc_context={})
    assert resolve_cc(n) == ["a@provintell.com"]


def test_unknown_token_is_dropped_silently(org_id):
    emp = _user(org_id, "emp@provintell.com")
    _route(org_id, "leave.approved", ["{nope}", "a@provintell.com"])
    assert resolve_cc(_notification(org_id, emp)) == ["a@provintell.com"]


def test_context_token_pointing_at_missing_user_is_dropped(org_id):
    import uuid

    emp = _user(org_id, "emp@provintell.com")
    _route(org_id, "leave.approved", ["{approver}"])
    n = _notification(org_id, emp, cc_context={"approver": str(uuid.uuid4())})
    assert resolve_cc(n) == []


def test_dedupes_against_the_to_address(org_id):
    emp = _user(org_id, "emp@provintell.com")
    _route(org_id, "leave.approved", ["emp@provintell.com", "a@provintell.com"])
    assert resolve_cc(_notification(org_id, emp)) == ["a@provintell.com"]


def test_dedupe_against_to_is_case_insensitive(org_id):
    emp = _user(org_id, "emp@provintell.com")
    _route(org_id, "leave.approved", ["EMP@Provintell.com"])
    assert resolve_cc(_notification(org_id, emp)) == []


def test_dedupes_repeated_entries_keeping_first_occurrence(org_id):
    emp = _user(org_id, "emp@provintell.com")
    _route(org_id, "leave.approved", ["a@provintell.com", "A@provintell.com"])
    assert resolve_cc(_notification(org_id, emp)) == ["a@provintell.com"]


def test_approver_who_is_also_a_literal_appears_once(org_id):
    emp = _user(org_id, "emp@provintell.com")
    appr = _user(org_id, "boss@provintell.com")
    _route(org_id, "leave.approved", ["boss@provintell.com", "{approver}"])
    n = _notification(org_id, emp, cc_context={"approver": str(appr.id)})
    assert resolve_cc(n) == ["boss@provintell.com"]


def test_available_tokens_lists_context_first_then_roles(org_id):
    tokens = [t["token"] for t in available_tokens("leave.approved")]
    assert tokens[0] == "{approver}"
    assert set(tokens[1:]) == {"{hr_managers}", "{org_admins}", "{finance}"}


def test_available_tokens_omits_context_tokens_a_type_cannot_bind(org_id):
    tokens = [t["token"] for t in available_tokens("payslip.published")]
    assert "{approver}" not in tokens
    assert "{requester}" not in tokens
    assert "{hr_managers}" in tokens


def test_available_tokens_carry_readable_labels(org_id):
    by_token = {t["token"]: t["label"] for t in available_tokens("leave.approved")}
    assert by_token["{approver}"] == "Approver"
    assert by_token["{hr_managers}"] == "HR managers"


def test_is_valid_token(org_id):
    assert is_valid_token("leave.approved", "{approver}") is True
    assert is_valid_token("leave.approved", "{hr_managers}") is True
    assert is_valid_token("payslip.published", "{approver}") is False
    assert is_valid_token("leave.approved", "{nope}") is False
