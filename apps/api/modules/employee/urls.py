from rest_framework.routers import DefaultRouter

from .views import EmployeeViewSet, TeamViewSet

router = DefaultRouter()
router.register(r"employees", EmployeeViewSet, basename="employee")
router.register(r"teams", TeamViewSet, basename="team")
urlpatterns = router.urls
