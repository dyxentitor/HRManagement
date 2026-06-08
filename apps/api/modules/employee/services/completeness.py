from __future__ import annotations

GROUPS: dict[str, tuple[str, ...]] = {
    "contact": ("phone",),
    "personal": ("date_of_birth", "gender", "nationality", "marital_status"),
    "address": ("address_line1", "city", "state", "postcode", "country_code"),
    "emergency_contact": (
        "emergency_contact_name",
        "emergency_contact_relationship",
        "emergency_contact_phone",
    ),
    "bank_details": ("bank_name", "bank_account_number"),
    "tax_ids": ("lhdn_tax_no", "epf_no", "socso_no", "eis_no"),
}


def _group_filled(emp, fields: tuple[str, ...]) -> bool:
    return all(bool(getattr(emp, f, None)) for f in fields)


def profile_completeness(emp) -> dict:
    missing = [g for g, fields in GROUPS.items() if not _group_filled(emp, fields)]
    total = len(GROUPS)
    filled = total - len(missing)
    return {"percent": round(filled / total * 100), "missing": missing}
