"""DRF exception handler that renders all errors as RFC 7807 Problem Details."""

from __future__ import annotations

from typing import Any

from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    NotAuthenticated,
    NotFound,
    PermissionDenied,
    ValidationError,
)
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from .errors import ProblemDetails


def _validation_error_to_field_list(exc: ValidationError) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    detail = exc.detail
    if isinstance(detail, dict):
        for field, msgs in detail.items():
            for msg in msgs if isinstance(msgs, list) else [msgs]:
                out.append({"field": field, "code": "invalid", "message": str(msg)})
    elif isinstance(detail, list):
        for msg in detail:
            out.append({"field": "non_field", "code": "invalid", "message": str(msg)})
    else:
        out.append({"field": "non_field", "code": "invalid", "message": str(detail)})
    return out


def hrms_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    if isinstance(exc, ProblemDetails):
        body = exc.to_dict()
        return Response(body, status=exc.status_code, content_type="application/problem+json")

    if isinstance(exc, ValidationError):
        body = {
            "type": "about:blank",
            "title": "Validation failed",
            "status": 400,
            "detail": "One or more fields failed validation.",
            "errors": _validation_error_to_field_list(exc),
        }
        return Response(body, status=400, content_type="application/problem+json")

    if isinstance(exc, NotAuthenticated):
        body = {
            "type": "about:blank",
            "title": "Authentication required",
            "status": 401,
            "detail": str(exc),
        }
        return Response(body, status=401, content_type="application/problem+json")

    if isinstance(exc, AuthenticationFailed):
        body = {
            "type": "about:blank",
            "title": "Invalid credentials",
            "status": 401,
            "detail": str(exc),
        }
        return Response(body, status=401, content_type="application/problem+json")

    if isinstance(exc, PermissionDenied):
        body = {
            "type": "about:blank",
            "title": "Permission denied",
            "status": 403,
            "detail": str(exc),
        }
        return Response(body, status=403, content_type="application/problem+json")

    if isinstance(exc, NotFound):
        body = {"type": "about:blank", "title": "Not found", "status": 404, "detail": str(exc)}
        return Response(body, status=404, content_type="application/problem+json")

    if isinstance(exc, APIException):
        body = {
            "type": "about:blank",
            "title": exc.default_detail if hasattr(exc, "default_detail") else "Error",
            "status": exc.status_code,
            "detail": str(exc.detail) if hasattr(exc, "detail") else str(exc),
        }
        return Response(body, status=exc.status_code, content_type="application/problem+json")

    # Fall back to DRF default for anything we don't handle.
    return drf_exception_handler(exc, context)
