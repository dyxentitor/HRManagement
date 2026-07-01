from .base import *  # noqa: F403

DEBUG = False
# Use UTC in tests so freeze_time("YYYY-MM-DD HH:MM:SS") naive strings map
# directly to Django's timezone.localdate() without cross-midnight surprises.
TIME_ZONE = "UTC"
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
DEFAULT_FROM_EMAIL = "test@hrms.local"
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",  # identity tests verify argon2
    "django.contrib.auth.hashers.MD5PasswordHasher",  # fast fallback
]
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
# Throttling is disabled per-test in conftest.py (via the settings fixture so DRF reloads).

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}
