"""Allow-listed {{ token }} substitution. Hardened in Task 10."""

from __future__ import annotations

import re

_TOKEN = re.compile(r"{{\s*(\w+)\s*}}")


def render_tokens(template: str, ctx: dict, allow: set[str] | None = None) -> str:
    def repl(m):
        name = m.group(1)
        if allow is not None and name not in allow:
            return ""
        return str(ctx.get(name, ""))

    return _TOKEN.sub(repl, template)
