from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import EmployeeViewSet, TeamViewSet
from .views_link_manager import UnlinkedEmployeesView, UnlinkedUsersView

router = DefaultRouter()
router.register(r"employees", EmployeeViewSet, basename="employee")
router.register(r"teams", TeamViewSet, basename="team")
urlpatterns = [
    *router.urls,
    path(
        "admin/unlinked-users/",
        UnlinkedUsersView.as_view(),
        name="admin-unlinked-users",
    ),
    path(
        "admin/unlinked-employees/",
        UnlinkedEmployeesView.as_view(),
        name="admin-unlinked-employees",
    ),
]
