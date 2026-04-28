"""RecentClaimsSelf card — user's own 5 most recent claim requests."""

from __future__ import annotations

from typing import Any, ClassVar

from modules.identity.models import User

from .base import Card


class RecentClaimsSelf(Card):
    type: ClassVar[str] = "recent_claims_self"
    requires_perms: ClassVar[list[str]] = ["claim:read:self"]

    @classmethod
    def fetch(cls, user: User) -> dict[str, Any]:
        from modules.claims.models import ClaimRequest
        from modules.employee.models import Employee

        emp = Employee.all_objects.filter(user_id=user.id, deleted_at__isnull=True).first()
        if emp is None:
            return {"type": cls.type, "title": "My recent claims", "data": {"claims": []}}

        claims = (
            ClaimRequest.all_objects.filter(employee=emp, deleted_at__isnull=True)
            .select_related("category")
            .order_by("-submitted_at")[:5]
        )
        return {
            "type": cls.type,
            "title": "My recent claims",
            "data": {
                "claims": [
                    {
                        "id": str(c.id),
                        "category": c.category.code,
                        "amount": str(c.amount),
                        "currency": c.currency_code,
                        "status": c.status,
                        "expense_date": c.expense_date.isoformat(),
                    }
                    for c in claims
                ],
            },
        }
