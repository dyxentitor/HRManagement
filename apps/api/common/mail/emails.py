"""Per-email subjects + placeholder registry (drives allow-list + preview samples)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TokenSpec:
    name: str
    description: str
    sample: str


SUBJECTS: dict[str, str] = {
    "digest": "[HRMS] {{ count }} new notification(s)",
    "notification": "[HRMS] {{ label }}",
    "security": "[HRMS] Security alert",
    "password_reset": "HRMS — Password reset",
    "bank_changed": "[HRMS] Bank info changed",
    "invite": "Welcome to {{ org }} — activate your account",
}

PLACEHOLDERS: dict[str, list[TokenSpec]] = {
    "password_reset": [TokenSpec("reset_url", "One-time reset link", "https://hrms/reset/abc")],
    "bank_changed": [
        TokenSpec("name", "Employee full name", "Jane Doe"),
        TokenSpec("employee_code", "Employee code", "E-1024"),
        TokenSpec("timestamp", "When it changed", "28 Jul 2026, 14:03"),
    ],
    "invite": [
        TokenSpec("org", "Organization name", "Provintell"),
        TokenSpec("link", "Activation link", "https://hrms/activate/xyz"),
        TokenSpec("hours", "Expiry hours", "48"),
    ],
    "notification": [
        TokenSpec("label", "Event label", "Leave request approved"),
        TokenSpec("link", "Deep link", "https://hrms/leave/me"),
    ],
}
