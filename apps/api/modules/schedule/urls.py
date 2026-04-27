from rest_framework.routers import DefaultRouter

from .views import (
    HolidayViewSet,
    ShiftAssignmentViewSet,
    ShiftViewSet,
    WorkScheduleViewSet,
)

router = DefaultRouter()
router.register(r"schedule/work-schedules", WorkScheduleViewSet, basename="work-schedule")
router.register(r"schedule/shifts", ShiftViewSet, basename="shift")
router.register(r"schedule/shift-assignments", ShiftAssignmentViewSet, basename="shift-assignment")
router.register(r"schedule/holidays", HolidayViewSet, basename="holiday")
urlpatterns = router.urls
