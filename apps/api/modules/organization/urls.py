from rest_framework.routers import DefaultRouter

from .views import DepartmentViewSet, OrganizationViewSet

router = DefaultRouter()
router.register(r"organizations", OrganizationViewSet, basename="organization")
router.register(r"departments", DepartmentViewSet, basename="department")
urlpatterns = router.urls
