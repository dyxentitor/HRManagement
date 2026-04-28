"""URL config for the certification + training module."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CertificationViewSet,
    TrainingAssignmentViewSet,
    TrainingPlanViewSet,
    TrainingProgressViewSet,
)

router = DefaultRouter()
router.register(r"certifications", CertificationViewSet, basename="certification")
router.register(r"training/plans", TrainingPlanViewSet, basename="training-plan")
router.register(r"training/assignments", TrainingAssignmentViewSet, basename="training-assignment")

urlpatterns = [
    *router.urls,
    path(
        "training/progress/",
        TrainingProgressViewSet.as_view({"post": "create"}),
        name="training-progress-create",
    ),
    path(
        "training/progress/<int:pk>/",
        TrainingProgressViewSet.as_view({"patch": "partial_update"}),
        name="training-progress-detail",
    ),
]
