"""render_email — resolve (override|default) email templates → (subject, text, html)."""

from __future__ import annotations

import logging

from django.template.loader import render_to_string

from common.mail.emails import SUBJECTS
from common.mail.tokens import render_tokens  # hardened in Task 10

logger = logging.getLogger(__name__)


def render_email(key: str, context: dict, org_id=None) -> tuple[str, str, str]:
    subject = context.get("subject") or render_tokens(SUBJECTS.get(key, "[HRMS]"), context)
    text = render_to_string(f"email/{key}.txt", context)
    html = render_to_string(f"email/{key}.html", context)
    return subject, text, html
