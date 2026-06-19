"""URL config for the announcements module."""

from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import AnnouncementViewSet

router = DefaultRouter()
router.register(r"announcements", AnnouncementViewSet, basename="announcement")

urlpatterns = [*router.urls]
