"""URL config for the KPI module."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    KpiAssignmentViewSet,
    KpiCycleViewSet,
    KpiReviewViewSet,
    KpiTeamSummaryViewSet,
    KpiTemplateViewSet,
)

router = DefaultRouter()
router.register(r"kpi/templates", KpiTemplateViewSet, basename="kpi-template")
router.register(r"kpi/cycles", KpiCycleViewSet, basename="kpi-cycle")
router.register(r"kpi/assignments", KpiAssignmentViewSet, basename="kpi-assignment")
router.register(r"kpi/reviews", KpiReviewViewSet, basename="kpi-review")

urlpatterns = [
    *router.urls,
    path(
        "kpi/team-summary",
        KpiTeamSummaryViewSet.as_view({"get": "list"}),
        name="kpi-team-summary",
    ),
]
