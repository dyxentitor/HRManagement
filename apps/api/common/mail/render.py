"""render_email — resolve (override|default) email templates → (subject, text, html)."""

from __future__ import annotations

import logging

from django.template.loader import render_to_string

from common.mail.emails import PLACEHOLDERS, SUBJECTS
from common.mail.tokens import render_tokens  # hardened in Task 10

logger = logging.getLogger(__name__)


def _allow(key: str) -> set[str]:
    """Return the set of permitted token names for a given email key."""
    return {t.name for t in PLACEHOLDERS.get(key, [])}


def _branding(org_id) -> dict:
    """Return accent/header_html/footer_html for the org (or safe defaults)."""
    from common.mail.models import EmailConfiguration

    cfg = EmailConfiguration.objects.filter(org_id=org_id).first() if org_id else None
    return {
        "accent": (cfg.accent_color if cfg and cfg.accent_color else "#7c5cff"),
        "header_html": (cfg.header_html if cfg else ""),
        "footer_html": (cfg.footer_html if cfg else ""),
    }


def render_email(key: str, context: dict, org_id=None) -> tuple[str, str, str]:
    # ── 1. Try per-org DB override ────────────────────────────────────────────
    if org_id is not None:
        from common.mail.models import EmailTemplate

        override = EmailTemplate.objects.filter(org_id=org_id, key=key).first()
        if override is not None:
            try:
                allow = _allow(key)
                subject = render_tokens(
                    override.subject or SUBJECTS.get(key, "[HRMS]"), context, allow
                )
                text = render_tokens(override.text_body, context, allow)
                # HTML token values are escaped to prevent user-data XSS inside HTML overrides.
                html = render_tokens(override.html_body, context, allow, escape=True)
                if subject and (text or html):
                    return subject, text, html
            except Exception:
                logger.exception(
                    "Bad email override for key=%s org=%s; using default", key, org_id
                )

    # ── 2. Filesystem default ─────────────────────────────────────────────────
    subject = context.get("subject") or render_tokens(SUBJECTS.get(key, "[HRMS]"), context)
    text = render_to_string(f"email/{key}.txt", context)
    html = render_to_string(f"email/{key}.html", {**context, **_branding(org_id)})
    return subject, text, html
