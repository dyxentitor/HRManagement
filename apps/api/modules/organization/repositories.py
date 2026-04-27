"""Repository helpers for the Organization model."""

from __future__ import annotations

from collections.abc import Iterable

from .models import Organization


class OrganizationRepository:
    @staticmethod
    def list_active() -> Iterable[Organization]:
        return Organization.objects.filter(status="active")

    @staticmethod
    def get_by_slug(slug: str) -> Organization | None:
        return Organization.objects.filter(slug=slug).first()
