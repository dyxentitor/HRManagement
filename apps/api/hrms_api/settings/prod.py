"""Production Django settings — fail-fast on misconfiguration."""
import sys

from .base import *  # noqa: F401,F403
from .base import DEBUG, SECRET_KEY  # for the guards below to reference imported values

# base.py reads DJANGO_DEBUG from env; if anyone sets DJANGO_DEBUG=1 in prod, we abort.
if DEBUG:
    sys.stderr.write("FATAL: DJANGO_DEBUG must be unset or 0 in production\n")
    sys.exit(1)

# Critical 2: refuse to start with the insecure default secret key.
if SECRET_KEY == "dev-insecure-replace-me":
    sys.stderr.write("FATAL: DJANGO_SECRET_KEY must be set in production\n")
    sys.exit(1)

SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = "DENY"
