from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    HolidayViewSet,
    ShiftAssignmentViewSet,
    ShiftSwapRequestViewSet,
    ShiftViewSet,
    WorkScheduleViewSet,
)

router = DefaultRouter()
router.register(r"schedule/work-schedules", WorkScheduleViewSet, basename="work-schedule")
router.register(r"schedule/shifts", ShiftViewSet, basename="shift")
router.register(r"schedule/shift-assignments", ShiftAssignmentViewSet, basename="shift-assignment")
router.register(r"schedule/holidays", HolidayViewSet, basename="holiday")
router.register(r"schedule/swap-requests", ShiftSwapRequestViewSet, basename="shift-swap-request")
urlpatterns = [
    *router.urls,
    path(
        "schedule/calendar/",
        ShiftAssignmentViewSet.as_view({"get": "calendar"}),
        name="schedule-calendar",
    ),
]
