"""Production Django settings — fail-fast on misconfiguration."""

import sys

from .base import *  # noqa: F403
from .base import DEBUG, SECRET_KEY  # for the guards below to reference imported values

# base.py reads DJANGO_DEBUG from env; if anyone sets DJANGO_DEBUG=1 in prod, we abort.
if DEBUG:
    sys.stderr.write("FATAL: DJANGO_DEBUG must be unset or 0 in production\n")
    sys.exit(1)

# Critical 2: refuse to start with the insecure default secret key.
if SECRET_KEY == "dev-insecure-replace-me":  # noqa: S105
    sys.stderr.write("FATAL: DJANGO_SECRET_KEY must be set in production\n")
    sys.exit(1)

SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = "DENY"

# Cross-origin POST allowlist (scheme-qualified, e.g. https://hrms.example.com).
# Set the CSRF_TRUSTED_ORIGINS env to the real frontend origin(s) in prod.
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])  # noqa: F405

# Error tracking — only initialised when SENTRY_DSN is provided (dep: sentry-sdk).
SENTRY_DSN = env("SENTRY_DSN", default="")  # noqa: F405
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration()],
        environment=env("SENTRY_ENVIRONMENT", default="production"),  # noqa: F405
        traces_sample_rate=env.float("SENTRY_TRACES_SAMPLE_RATE", default=0.0),  # noqa: F405
        send_default_pii=False,
    )
