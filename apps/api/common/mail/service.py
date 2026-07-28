"""Central email service — resolves SMTP transport from the DB config at send-time."""

from __future__ import annotations

import uuid

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.utils import timezone

from .models import EmailConfiguration

_MERGE_FIELDS = (
    "smtp_host",
    "smtp_port",
    "encryption",
    "use_auth",
    "smtp_username",
    "sender_name",
    "sender_email",
    "reply_to",
    "connection_timeout",
)


def get_or_create_config(org_id: uuid.UUID) -> EmailConfiguration:
    cfg, _ = EmailConfiguration.objects.get_or_create(org_id=org_id)
    return cfg


def get_config(org_id: uuid.UUID) -> EmailConfiguration | None:
    return EmailConfiguration.objects.filter(org_id=org_id).first()


def build_connection(config: EmailConfiguration | None):
    """Build a mail connection from the config, or the env backend when unconfigured."""
    if config is None or not (config.smtp_host or "").strip():
        return get_connection()  # env-configured EMAIL_* (MailHog in dev)
    return get_connection(
        backend="django.core.mail.backends.smtp.EmailBackend",
        host=config.smtp_host,
        port=config.smtp_port,
        username=config.smtp_username if config.use_auth else "",
        password=config.smtp_password if config.use_auth else "",
        use_tls=(config.encryption == "starttls"),
        use_ssl=(config.encryption == "ssl"),
        timeout=config.connection_timeout,
    )


def _from_email(config: EmailConfiguration | None, override: str | None) -> str:
    if override:
        return override
    if config and config.sender_email:
        if config.sender_name:
            return f"{config.sender_name} <{config.sender_email}>"
        return config.sender_email
    return getattr(settings, "DEFAULT_FROM_EMAIL", "hrms@provintell.local")


def _apply_signature(config: EmailConfiguration | None, text: str, html: str | None):
    if not (config and config.signature):
        return text, html
    text = f"{text}\n\n-- \n{config.signature}"
    if html is not None:
        sig_html = config.signature.replace("\n", "<br>")
        html = f'{html}<hr><div style="color:#6b6b80;font-size:13px">{sig_html}</div>'
    return text, html


def send(
    *,
    org_id,
    subject,
    body,
    to,
    html_body=None,
    from_email=None,
    reply_to=None,
    fail_silently=False,
    category="notification",
    append_signature=False,
) -> bool:
    config = get_config(org_id)
    if category == "notification" and config is not None and not config.enabled:
        return False  # globally disabled — skip notification email

    text, html = body, html_body
    if append_signature:
        text, html = _apply_signature(config, text, html)

    reply = reply_to or (config.reply_to if config and config.reply_to else None)
    msg = EmailMultiAlternatives(
        subject=subject,
        body=text,
        from_email=_from_email(config, from_email),
        to=list(to),
        reply_to=[reply] if reply else None,
        connection=build_connection(config),
    )
    if html:
        msg.attach_alternative(html, "text/html")
    msg.send(fail_silently=fail_silently)
    return True


def _draft_config(stored: EmailConfiguration, overrides: dict) -> EmailConfiguration:
    """A non-persisted config = stored row overlaid with posted overrides.

    Blank/omitted password falls back to the stored secret.
    """
    draft = EmailConfiguration(org_id=stored.org_id)
    for f in (*_MERGE_FIELDS, "enabled", "signature"):
        setattr(draft, f, overrides.get(f, getattr(stored, f)))
    draft.smtp_password = overrides.get("smtp_password") or stored.smtp_password
    return draft


def _record_health(config: EmailConfiguration, *, ok: bool, message: str = "") -> None:
    now = timezone.now()
    config.last_test_at = now
    if ok:
        config.last_success_at = now
    else:
        config.last_failure_at = now
        config.last_failure_message = (message or "")[:500]
    config.save(
        update_fields=[
            "last_test_at",
            "last_success_at",
            "last_failure_at",
            "last_failure_message",
            "updated_at",
        ]
    )


def run_connection_test(org_id, overrides: dict) -> dict:
    stored = get_or_create_config(org_id)
    draft = _draft_config(stored, overrides)
    conn = build_connection(draft)
    try:
        conn.open()
        conn.close()
    except Exception as exc:
        _record_health(stored, ok=False, message=str(exc))
        return {"success": False, "message": "Connection failed", "detail": str(exc)}
    _record_health(stored, ok=True)
    enc = draft.encryption.upper()
    return {
        "success": True,
        "message": "Connection successful",
        "detail": f"Connected to {draft.smtp_host}:{draft.smtp_port} ({enc}).",
    }


def send_test_email(
    org_id, recipient: str, overrides: dict, *, template_key: str | None = None
) -> dict:
    stored = get_or_create_config(org_id)
    draft = _draft_config(stored, overrides)

    if template_key:
        # Render the named template with sample data from PLACEHOLDERS.
        from common.mail.emails import PLACEHOLDERS
        from common.mail.render import render_email

        sample_ctx = {t.name: t.sample for t in PLACEHOLDERS.get(template_key, [])}
        try:
            subject, body, html_body = render_email(template_key, sample_ctx, org_id=org_id)
        except Exception as exc:
            return {"success": False, "message": "Template render failed", "detail": str(exc)}
    else:
        subject = "[HRMS] Test email"
        body = (
            "This is a test message from your HRMS email configuration.\n\n"
            f"Sent to: {recipient}\nIf you received this, SMTP delivery is working."
        )
        html_body = None

    msg = EmailMultiAlternatives(
        subject=subject,
        body=body,
        from_email=_from_email(draft, None),
        to=[recipient],
        connection=build_connection(draft),
    )
    if html_body:
        msg.attach_alternative(html_body, "text/html")
    try:
        msg.send(fail_silently=False)
    except Exception as exc:
        _record_health(stored, ok=False, message=str(exc))
        return {"success": False, "message": "Send failed", "detail": str(exc)}
    _record_health(stored, ok=True)
    return {"success": True, "message": "Test email sent", "detail": f"Delivered to {recipient}."}
