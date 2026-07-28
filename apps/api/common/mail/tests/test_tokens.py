"""Tests for common.mail.tokens — hardened render_tokens (Task 10)."""

from __future__ import annotations


def test_tokens_reject_django_tags():
    """Django {% %} blocks must be stripped; allowed {{ }} tokens still substituted."""
    from common.mail.tokens import render_tokens

    out = render_tokens("{% for x in y %}{{ name }}", {"name": "Jane"}, allow={"name"})
    assert "{%" not in out and "Jane" in out


def test_tokens_escape_html_values():
    """escape=True must HTML-escape substituted values (SSTI / XSS guard)."""
    from common.mail.tokens import render_tokens

    out = render_tokens("{{ name }}", {"name": "<script>"}, allow={"name"}, escape=True)
    assert "<script>" not in out and "&lt;script&gt;" in out


def test_tokens_unknown_name_blank():
    """Token names not in allow set resolve to empty string."""
    from common.mail.tokens import render_tokens

    out = render_tokens("{{ secret }}", {"secret": "boom"}, allow={"name"})
    assert "boom" not in out
    assert out == ""


def test_tokens_no_allow_list_passes_all():
    """When allow=None every token in ctx is substituted."""
    from common.mail.tokens import render_tokens

    out = render_tokens("{{ a }} {{ b }}", {"a": "hello", "b": "world"})
    assert out == "hello world"


def test_tokens_multiline_tag_stripped():
    """Multiline {% %} blocks (DOTALL) are removed."""
    from common.mail.tokens import render_tokens

    template = "{% block content\nmore %} {{ name }}"
    out = render_tokens(template, {"name": "Alice"}, allow={"name"})
    assert "{%" not in out and "Alice" in out
