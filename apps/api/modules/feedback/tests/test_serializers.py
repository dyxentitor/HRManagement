import pytest

from modules.feedback.models import Feedback, FeedbackNote
from modules.feedback.serializers import FeedbackAdminSerializer, FeedbackSerializer
from modules.identity.models import User
from modules.organization.models import Organization

pytestmark = pytest.mark.django_db


@pytest.fixture
def org():
    return Organization.objects.create(
        name="Test Org",
        slug="test-org-ser",
        country_code="MY",
        default_currency="MYR",
        default_timezone="Asia/Kuala_Lumpur",
        default_locale="en-MY",
    )


@pytest.fixture
def a_user(org):
    return User.objects.create_user(
        email="testuser-ser@example.com",
        password="s3cret-p@ss",  # pragma: allowlist secret
        org_id=org.id,
    )


def test_reporter_serializer_hides_internal(org, a_user):
    fb = Feedback.objects.create(
        org_id=org.id,
        reporter=a_user,
        category="bug",
        title="T",
        description="D",
        assignee=a_user,
    )
    FeedbackNote.objects.create(feedback=fb, author_id=a_user.id, body="secret")
    data = FeedbackSerializer(fb).data
    assert "notes" not in data and "assignee_id" not in data and "assignee_name" not in data
    assert data["title"] == "T" and data["status"] == "new" and "reporter_name" in data


def test_admin_serializer_shows_internal(org, a_user):
    fb = Feedback.objects.create(
        org_id=org.id,
        reporter=a_user,
        category="bug",
        title="T",
        description="D",
        assignee=a_user,
    )
    FeedbackNote.objects.create(feedback=fb, author_id=a_user.id, body="secret")
    data = FeedbackAdminSerializer(fb).data
    assert data["assignee_id"] is not None
    assert len(data["notes"]) == 1
    assert data["notes"][0]["body"] == "secret"
