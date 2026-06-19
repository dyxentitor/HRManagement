"""URL config for the onboarding module."""

from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import OnboardingChecklistViewSet

router = DefaultRouter()
router.register(r"onboarding", OnboardingChecklistViewSet, basename="onboarding")

urlpatterns = [*router.urls]
