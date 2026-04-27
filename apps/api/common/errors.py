"""ProblemDetails exception class for RFC 7807 Problem Details responses."""

from __future__ import annotations

from typing import Any

from rest_framework.exceptions import APIException


class ProblemDetails(APIException):
    """Application-level errors that should serialize as RFC 7807."""

    default_type = "about:blank"
    default_title = "Internal Server Error"
    default_status = 500
    default_detail = "An unexpected error occurred."

    def __init__(
        self,
        type_: str | None = None,
        title: str | None = None,
        status: int | None = None,
        detail: str | None = None,
        errors: list[dict[str, Any]] | None = None,
        instance: str | None = None,
        **extra: Any,
    ) -> None:
        self.type = type_ or self.default_type
        self.title = title or self.default_title
        self.status_code = status or self.default_status
        self.detail = detail or self.default_detail
        self.errors = errors or []
        self.instance = instance
        self.extra = extra
        super().__init__(detail=self.detail, code="problem")

    def to_dict(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "type": self.type,
            "title": self.title,
            "status": self.status_code,
            "detail": self.detail,
        }
        if self.instance is not None:
            body["instance"] = self.instance
        if self.errors:
            body["errors"] = self.errors
        body.update(self.extra)
        return body
