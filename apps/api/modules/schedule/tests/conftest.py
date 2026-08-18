"""Shared fixtures for schedule tests.

The ``swap_env`` fixture was moved to the api-level conftest.py so that it is
also discoverable from modules/dashboard/tests/ without any cross-package
import tricks.  pytest walks upward through conftest files, so every package
under apps/api/ picks it up automatically.
"""
