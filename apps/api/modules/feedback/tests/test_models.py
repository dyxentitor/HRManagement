import uuid
import pytest

from modules.feedback.models import Feedback, FeedbackAttachment, FeedbackNote, STATUS_CHOICES, CATEGORY_CHOICES
from modules.identity.models import User
from modules.organization.models import Organization

pytestmark = pytest.mark.django_db


@pytest.fixture
def org():
    return Organization.objects.create(
        name="Test Org",
        slug="test-org",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def a_user(org):
    return User.objects.create_user(
        email="testuser@example.com",
        password="s3cret-p@ss",  # pragma: allowlist secret
        org_id=org.id,
    )


def test_feedback_defaults_status_new(org, a_user):
    fb = Feedback.objects.create(org_id=org.id, reporter=a_user, category="bug", title="T", description="D")
    assert fb.status == "new"
    assert fb.affected_module == ""
    assert fb.assignee is None


def test_choices_present():
    assert dict(STATUS_CHOICES).keys() >= {"new", "in_review", "resolved", "closed"}
    assert dict(CATEGORY_CHOICES).keys() >= {"bug", "feature", "improvement", "uiux", "performance", "security", "documentation", "general"}


def test_attachment_and_note_relate(org, a_user):
    fb = Feedback.objects.create(org_id=org.id, reporter=a_user, category="general", title="T", description="D")
    FeedbackAttachment.objects.create(feedback=fb, filename="a.png", content_type="image/png", size_bytes=10, s3_key="k", uploaded_by=a_user.id)
    FeedbackNote.objects.create(feedback=fb, author_id=a_user.id, body="note")
    assert fb.attachments.count() == 1 and fb.notes.count() == 1
