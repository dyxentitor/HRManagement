"""Tests for EmailTemplate model and EmailConfiguration branding fields."""
from __future__ import annotations

import uuid

import pytest
from django.db import IntegrityError

from common.mail.models import EmailConfiguration, EmailTemplate


@pytest.mark.django_db
def test_email_template_create():
    """EmailTemplate can be created with required fields."""
    org_id = uuid.uuid4()
    tmpl = EmailTemplate.objects.create(
        org_id=org_id,
        key="welcome",
        subject="Welcome!",
        html_body="<p>Hello</p>",
        text_body="Hello",
    )
    tmpl.refresh_from_db()
    assert tmpl.org_id == org_id
    assert tmpl.key == "welcome"
    assert tmpl.subject == "Welcome!"
    assert str(tmpl) == f"EmailTemplate(org={org_id}, key=welcome)"


@pytest.mark.django_db
def test_email_template_body_fields_default_blank():
    """subject, html_body, text_body default to empty string."""
    org_id = uuid.uuid4()
    tmpl = EmailTemplate.objects.create(org_id=org_id, key="minimal")
    tmpl.refresh_from_db()
    assert tmpl.subject == ""
    assert tmpl.html_body == ""
    assert tmpl.text_body == ""


@pytest.mark.django_db
def test_email_template_unique_together_enforced():
    """unique_together on (org_id, key) prevents duplicate rows."""
    org_id = uuid.uuid4()
    EmailTemplate.objects.create(org_id=org_id, key="invite")
    with pytest.raises(IntegrityError):
        EmailTemplate.objects.create(org_id=org_id, key="invite")


@pytest.mark.django_db
def test_email_template_same_key_different_org_allowed():
    """Same key under a different org_id is allowed."""
    key = "password_reset"
    EmailTemplate.objects.create(org_id=uuid.uuid4(), key=key)
    EmailTemplate.objects.create(org_id=uuid.uuid4(), key=key)  # must not raise


@pytest.mark.django_db
def test_email_configuration_branding_fields_default_blank():
    """New branding fields accent_color, header_html, footer_html default to ''."""
    cfg = EmailConfiguration.objects.create(org_id=uuid.uuid4())
    cfg.refresh_from_db()
    assert cfg.accent_color == ""
    assert cfg.header_html == ""
    assert cfg.footer_html == ""


@pytest.mark.django_db
def test_email_configuration_branding_fields_persist():
    """Branding fields round-trip through the database."""
    org_id = uuid.uuid4()
    cfg = EmailConfiguration.objects.create(
        org_id=org_id,
        accent_color="#1A2B3C",
        header_html="<header>Logo</header>",
        footer_html="<footer>Unsubscribe</footer>",
    )
    cfg.refresh_from_db()
    assert cfg.accent_color == "#1A2B3C"
    assert cfg.header_html == "<header>Logo</header>"
    assert cfg.footer_html == "<footer>Unsubscribe</footer>"
