import uuid

import pytest

from modules.announcements.models import Announcement, AnnouncementAttachment
from modules.announcements.services.attachment import AttachmentService


@pytest.mark.django_db
def test_register_creates_row():
    a = Announcement.objects.create(org_id=uuid.uuid4(), title="T", body="B")
    att = AttachmentService.register(
        announcement=a,
        filename="policy.pdf",
        content_type="application/pdf",
        size_bytes=1024,
        s3_key="announcements/x/abc_policy.pdf",
        uploaded_by=uuid.uuid4(),
    )
    assert AnnouncementAttachment.objects.filter(id=att.id).exists()
    assert att.filename == "policy.pdf"


@pytest.mark.django_db
def test_register_enforces_size_cap():
    a = Announcement.objects.create(org_id=uuid.uuid4(), title="T", body="B")
    with pytest.raises(ValueError, match="exceeds"):
        AttachmentService.register(
            announcement=a,
            filename="big.bin",
            content_type="application/octet-stream",
            size_bytes=AttachmentService.MAX_SIZE_BYTES + 1,
            s3_key="k",
            uploaded_by=uuid.uuid4(),
        )
