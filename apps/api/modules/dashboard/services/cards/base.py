"""Card base class."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, ClassVar

from modules.identity.models import User


class Card(ABC):
    type: ClassVar[str]
    requires_perms: ClassVar[list[str]] = []

    @classmethod
    def is_visible_for(cls, user: User) -> bool:
        from modules.identity.services.permissions import get_user_perms

        if not cls.requires_perms:
            return True
        perms = get_user_perms(user)
        return all(p in perms for p in cls.requires_perms)

    @classmethod
    @abstractmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        """Return the card's data dict. Frontend renders by `type`."""
        ...
