"""Allow-listed {{ token }} substitution. Hardened in Task 10."""

from __future__ import annotations

import re
from html import escape as html_escape

_TAG = re.compile(r"{%.*?%}", re.DOTALL)
_TOKEN = re.compile(r"{{\s*(\w+)\s*}}")


def render_tokens(
    template: str,
    ctx: dict,
    allow: set[str] | None = None,
    *,
    escape: bool = False,
) -> str:
    # Strip all {% ... %} blocks — no Django tags survive in DB-authored overrides (SSTI guard).
    template = _TAG.sub("", template)

    def repl(m):
        name = m.group(1)
        if allow is not None and name not in allow:
            return ""
        val = str(ctx.get(name, ""))
        return html_escape(val) if escape else val

    return _TOKEN.sub(repl, template)
