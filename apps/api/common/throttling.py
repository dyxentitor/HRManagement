"""Scoped throttles for abuse-prone endpoints."""

from __future__ import annotations

from rest_framework.throttling import AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    """Tight per-IP throttle for auth entry points (login, MFA, password reset).

    Uses the ``login`` rate from REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'].
    Keyed by client IP so credential-stuffing/brute-force is bounded regardless
    of the (unauthenticated) account being targeted.
    """

    scope = "login"
