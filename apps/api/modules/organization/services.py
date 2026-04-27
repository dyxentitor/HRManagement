"""Domain services for the organization module."""

from __future__ import annotations

from .models import Organization
from .repositories import OrganizationRepository


class OrganizationService:
    @staticmethod
    def list_active() -> list[Organization]:
        return list(OrganizationRepository.list_active())

    @staticmethod
    def get(slug: str) -> Organization | None:
        return OrganizationRepository.get_by_slug(slug)
