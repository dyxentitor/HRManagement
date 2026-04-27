from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import DepartmentViewSet, OrganizationViewSet, OrgSettingsView

router = DefaultRouter()
router.register(r"organizations", OrganizationViewSet, basename="organization")
router.register(r"departments", DepartmentViewSet, basename="department")
urlpatterns = [
    *router.urls,
    path("org/settings", OrgSettingsView.as_view(), name="org-settings"),
]
