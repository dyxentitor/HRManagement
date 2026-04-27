"""common.audit — re-exports for convenience."""

from __future__ import annotations


def append(*args, **kwargs):
    from .service import append as _append

    return _append(*args, **kwargs)


def append_payroll(*args, **kwargs):
    from .service import append_payroll as _append_payroll

    return _append_payroll(*args, **kwargs)


def verify_payroll_chain(*args, **kwargs):
    from .service import verify_payroll_chain as _verify

    return _verify(*args, **kwargs)


__all__ = ["append", "append_payroll", "verify_payroll_chain"]
