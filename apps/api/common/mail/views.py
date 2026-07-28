from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit.service import append as audit_append
from common.mail import service
from common.mail.emails import PLACEHOLDERS, SUBJECTS
from common.mail.models import EmailTemplate
from common.mail.serializers import (
    EmailConfigurationSerializer,
    EmailConfigWriteSerializer,
    EmailTemplatePreviewSerializer,
    EmailTemplateWriteSerializer,
    SendTestEmailSerializer,
    TestConnectionSerializer,
    _label_for,
    _placeholders_for,
)
from common.mail.tokens import render_tokens
from modules.identity.permissions import HRMSPermission
from modules.identity.services.permissions import get_user_perms


class EmailConfigView(APIView):
    permission_classes: ClassVar = [HRMSPermission]

    @property
    def required_perms(self):
        if self.request.method == "GET":
            return ["org:email_config:read"]
        return ["org:email_config:write"]

    @extend_schema(responses=EmailConfigurationSerializer)
    def get(self, request):
        cfg = service.get_or_create_config(request.user.org_id)
        return Response(EmailConfigurationSerializer(cfg).data)

    @extend_schema(request=EmailConfigWriteSerializer, responses=EmailConfigurationSerializer)
    def patch(self, request):
        cfg = service.get_or_create_config(request.user.org_id)
        ser = EmailConfigWriteSerializer(cfg, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        changed = [f for f in ser.validated_data if f != "smtp_password"]
        if ser.validated_data.get("smtp_password"):
            changed.append("smtp_password")
        ser.save(updated_by=request.user)
        if changed:
            audit_append(
                org_id=request.user.org_id,
                action="email_config.updated",
                entity="email_config",
                entity_id=cfg.id,
                after={"changed_fields": changed},
            )
        cfg.refresh_from_db()
        return Response(EmailConfigurationSerializer(cfg).data)


def _require_write(user) -> bool:
    return "org:email_config:write" in get_user_perms(user)


def _require_read(user) -> bool:
    return "org:email_config:read" in get_user_perms(user)


@extend_schema(request=TestConnectionSerializer, responses=dict)
@api_view(["POST"])
@permission_classes([HRMSPermission])
def test_connection_view(request):
    if not _require_write(request.user):
        return Response({"detail": "Permission denied"}, status=403)
    ser = TestConnectionSerializer(data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    result = service.run_connection_test(request.user.org_id, ser.validated_data)
    audit_append(
        org_id=request.user.org_id,
        action="email_config.tested",
        entity="email_config",
        entity_id=service.get_or_create_config(request.user.org_id).id,
        after={"success": result["success"]},
    )
    return Response(result)


@extend_schema(request=SendTestEmailSerializer, responses=dict)
@api_view(["POST"])
@permission_classes([HRMSPermission])
def send_test_email_view(request):
    if not _require_write(request.user):
        return Response({"detail": "Permission denied"}, status=403)
    ser = SendTestEmailSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    recipient = ser.validated_data.pop("recipient")
    template_key = ser.validated_data.pop("template_key", None) or None
    result = service.send_test_email(
        request.user.org_id, recipient, ser.validated_data, template_key=template_key
    )
    audit_append(
        org_id=request.user.org_id,
        action="email_config.test_email_sent",
        entity="email_config",
        entity_id=service.get_or_create_config(request.user.org_id).id,
        after={"recipient": recipient, "success": result["success"]},
    )
    return Response(result)


# ── Known-key validation helper ───────────────────────────────────────────────

_KNOWN_KEYS: frozenset[str] = frozenset(SUBJECTS.keys())


def _validate_key(key: str):
    """Return a 404 Response if *key* is not in SUBJECTS, else None."""
    if key not in _KNOWN_KEYS:
        return Response({"detail": f"Unknown template key: {key!r}"}, status=404)
    return None


# ── Email-template list / detail ──────────────────────────────────────────────


class EmailTemplateListView(APIView):
    """GET  /org/email-templates/ — list all known template keys with override status."""

    permission_classes: ClassVar = [HRMSPermission]

    @property
    def required_perms(self):
        return ["org:email_config:read"]

    def get(self, request):
        org_id = request.user.org_id
        overridden = set(
            EmailTemplate.objects.filter(org_id=org_id, key__in=_KNOWN_KEYS).values_list(
                "key", flat=True
            )
        )
        items = [
            {
                "key": key,
                "label": _label_for(key),
                "has_override": key in overridden,
                "placeholders": _placeholders_for(key),
            }
            for key in sorted(_KNOWN_KEYS)
        ]
        return Response(items)


class EmailTemplateDetailView(APIView):
    """
    GET    /org/email-templates/{key}/  — detail (override content or empty if none)
    PATCH  /org/email-templates/{key}/  — upsert override
    DELETE /org/email-templates/{key}/  — reset (delete override row)
    """

    permission_classes: ClassVar = [HRMSPermission]

    @property
    def required_perms(self):
        if self.request.method == "GET":
            return ["org:email_config:read"]
        return ["org:email_config:write"]

    def get(self, request, key: str):
        err = _validate_key(key)
        if err:
            return err
        org_id = request.user.org_id
        override = EmailTemplate.objects.filter(org_id=org_id, key=key).first()
        if override:
            data = {
                "key": key,
                "subject": override.subject,
                "text_body": override.text_body,
                "html_body": override.html_body,
                "has_override": True,
                "placeholders": _placeholders_for(key),
            }
        else:
            # Design choice: return empty strings when no override exists.
            # The frontend editor can start from a blank slate; the default
            # filesystem template is still used for actual delivery.
            data = {
                "key": key,
                "subject": "",
                "text_body": "",
                "html_body": "",
                "has_override": False,
                "placeholders": _placeholders_for(key),
            }
        return Response(data)

    def patch(self, request, key: str):
        err = _validate_key(key)
        if err:
            return err
        org_id = request.user.org_id
        ser = EmailTemplateWriteSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        override, created = EmailTemplate.objects.get_or_create(
            org_id=org_id,
            key=key,
            defaults=ser.validated_data,
        )
        if not created:
            for field, value in ser.validated_data.items():
                setattr(override, field, value)
            override.save()
        audit_append(
            org_id=org_id,
            action="email_template.updated",
            entity="email_template",
            entity_id=override.id,
            after={"key": key},
        )
        return Response(
            {
                "key": key,
                "subject": override.subject,
                "text_body": override.text_body,
                "html_body": override.html_body,
                "has_override": True,
                "placeholders": _placeholders_for(key),
            }
        )

    def delete(self, request, key: str):
        err = _validate_key(key)
        if err:
            return err
        org_id = request.user.org_id
        EmailTemplate.objects.filter(org_id=org_id, key=key).delete()
        # entity_id is non-nullable; use org_id as a stable reference when
        # there is no longer a row to point at (the override was just deleted).
        audit_append(
            org_id=org_id,
            action="email_template.reset",
            entity="email_template",
            entity_id=org_id,
            after={"key": key},
        )
        return Response(status=204)


# ── Preview endpoint ──────────────────────────────────────────────────────────


@extend_schema(request=EmailTemplatePreviewSerializer, responses=dict)
@api_view(["POST"])
@permission_classes([HRMSPermission])
def email_template_preview_view(request, key: str):
    if not _require_read(request.user):
        return Response({"detail": "Permission denied"}, status=403)
    err = _validate_key(key)
    if err:
        return err

    # Build sample context from PLACEHOLDERS for this key.
    sample_ctx: dict = {t.name: t.sample for t in PLACEHOLDERS.get(key, [])}
    allow: set[str] = {t.name for t in PLACEHOLDERS.get(key, [])}

    ser = EmailTemplatePreviewSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    posted_subject = ser.validated_data.get("subject", "")
    posted_text = ser.validated_data.get("text_body", "")
    posted_html = ser.validated_data.get("html_body", "")

    any_posted = bool(posted_subject or posted_text or posted_html)

    if any_posted:
        # Preview the caller's unsaved edits.
        rendered_subject = render_tokens(posted_subject, sample_ctx, allow)
        rendered_text = render_tokens(posted_text, sample_ctx, allow)
        rendered_html = render_tokens(posted_html, sample_ctx, allow, escape=True)
    else:
        # Render the effective template (DB override if present).
        org_id = request.user.org_id
        override = EmailTemplate.objects.filter(org_id=org_id, key=key).first()
        if override:
            rendered_subject = render_tokens(
                override.subject or SUBJECTS.get(key, "[HRMS]"), sample_ctx, allow
            )
            rendered_text = render_tokens(override.text_body, sample_ctx, allow)
            rendered_html = render_tokens(override.html_body, sample_ctx, allow, escape=True)
        else:
            # No override and no posted content: preview default subject with sample tokens.
            rendered_subject = render_tokens(SUBJECTS.get(key, "[HRMS]"), sample_ctx, allow)
            rendered_text = ""
            rendered_html = ""

    return Response(
        {"subject": rendered_subject, "text": rendered_text, "html": rendered_html}
    )
