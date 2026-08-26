"""Canonical holiday identity — the layer that makes precedence actually work.

A display name is not an identifier. Providers rename holidays, gazettes use
different wording, and languages differ. Resolving every spelling to one
canonical code is what lets an official override *outrank* a provider row
instead of sitting beside it.

The mechanism is country-neutral; only the alias data is per-country.
"""

from __future__ import annotations

import functools
from pathlib import Path

import yaml

from .base import slugify_holiday_name

ALIAS_DIR = Path(__file__).resolve().parent / "aliases"


class DuplicateAliasError(ValueError):
    """One slug mapped to two canonical codes — refuse rather than guess."""


@functools.cache
def _alias_index(country_code: str) -> dict[str, str]:
    """slug -> canonical code, for one country. Cached; data is static."""
    path = ALIAS_DIR / f"{country_code.lower()}.yaml"
    if not path.exists():
        return {}
    with path.open() as fh:
        raw = yaml.safe_load(fh) or {}

    index: dict[str, str] = {}
    for canonical, aliases in raw.items():
        canonical_slug = slugify_holiday_name(str(canonical))
        # A canonical code is always an alias of itself.
        for alias in [canonical, *(aliases or [])]:
            slug = slugify_holiday_name(str(alias))
            existing = index.get(slug)
            if existing is not None and existing != canonical_slug:
                raise DuplicateAliasError(
                    f"{country_code}: alias {slug!r} maps to both "
                    f"{existing!r} and {canonical_slug!r}"
                )
            index[slug] = canonical_slug
    return index


def canonical_code(*, country_code: str, name: str) -> str:
    """Resolve a display name to this country's canonical holiday code.

    Falls back to the name's own slug when unknown. That is deliberate: an
    unrecognised holiday gets its own identity rather than being merged into
    a neighbour, so the failure mode is a duplicate to review — never two
    real holidays silently collapsed into one.
    """
    slug = slugify_holiday_name(name)
    return _alias_index(country_code.upper()).get(slug, slug)


def build_canonical_key(
    *,
    country_code: str,
    subdivision_code: str | None,
    year: int,
    name: str,
    occurrence: int = 1,
) -> str:
    """Internal, provider-independent, name-independent identity.

    Stable across: a provider rename, a language switch, a change of provider,
    and a date correction. Distinct across: subdivision, year, and each day of
    a multi-day festival (via `occurrence`).
    """
    scope = subdivision_code or country_code
    code = canonical_code(country_code=country_code, name=name)
    suffix = "" if occurrence <= 1 else f"#{occurrence}"
    return f"{country_code}:{scope}:{year}:{code}{suffix}"


def build_external_id(
    *,
    provider: str,
    country_code: str,
    subdivision_code: str | None,
    year: int,
    name: str,
    occurrence: int = 1,
) -> str:
    """The *provider's own* identity for a record, kept verbatim for audit.

    Deliberately built from the provider's raw name, so if upstream renames a
    holiday we can see the external identity change while the canonical
    identity holds steady.
    """
    scope = subdivision_code or country_code
    suffix = "" if occurrence <= 1 else f"#{occurrence}"
    return f"{provider}:{country_code}:{scope}:{year}:{slugify_holiday_name(name)}{suffix}"
