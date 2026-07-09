from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    DepartmentViewSet,
    OrganizationViewSet,
    OrgBrandingView,
    OrgLogoPresignedUploadView,
    OrgLogoView,
    OrgSettingsView,
)

router = DefaultRouter()
router.register(r"organizations", OrganizationViewSet, basename="organization")
router.register(r"departments", DepartmentViewSet, basename="department")
urlpatterns = [
    *router.urls,
    path("org/branding", OrgBrandingView.as_view(), name="org-branding"),
    path("org/settings", OrgSettingsView.as_view(), name="org-settings"),
    path(
        "org/logo/presigned-upload",
        OrgLogoPresignedUploadView.as_view(),
        name="org-logo-presigned-upload",
    ),
    path("org/logo", OrgLogoView.as_view(), name="org-logo"),
]
