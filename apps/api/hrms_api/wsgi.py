"""WSGI entry point for production servers (gunicorn)."""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hrms_api.settings.prod")

application = get_wsgi_application()
