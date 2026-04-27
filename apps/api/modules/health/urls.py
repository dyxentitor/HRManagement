from django.urls import path

from .views import health, ready

urlpatterns = [
    path("health", health, name="health"),
    path("health/ready", ready, name="health-ready"),
]
