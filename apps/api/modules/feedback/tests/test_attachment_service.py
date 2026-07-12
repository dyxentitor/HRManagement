"""Tests for FeedbackAttachmentService."""

import pytest
from rest_framework.exceptions import ValidationError

from modules.feedback.models import Feedback
from modules.feedback.services.attachment import FeedbackAttachmentService
from modules.identity.models import User
from modules.organization.models import Organization

pytestmark = pytest.mark.django_db


@pytest.fixture
def org():
    return Organization.objects.create(
        name="Test Org",
        slug="test-org-svc",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def a_user(org):
    return User.objects.create_user(
        email="svcuser@example.com",
        password="s3cret-p@ss",  # pragma: allowlist secret
        org_id=org.id,
    )


def test_presigned_key_format(org, a_user):
    fb = Feedback.objects.create(
        org_id=org.id, reporter=a_user, category="bug", title="T", description="D"
    )
    out = FeedbackAttachmentService.presigned_upload(fb, "shot.png", "image/png")
    assert out["s3_key"].startswith(f"feedback/{fb.id}/") and out["s3_key"].endswith("_shot.png")
    assert out["max_size_bytes"] == 25 * 1024 * 1024


def test_register_rejects_oversize(org, a_user):
    fb = Feedback.objects.create(
        org_id=org.id, reporter=a_user, category="bug", title="T", description="D"
    )
    with pytest.raises(ValidationError):
        FeedbackAttachmentService.register(
            fb,
            "big.bin",
            "application/octet-stream",
            26 * 1024 * 1024,
            "feedback/x/y_big.bin",
            a_user.id,
        )
