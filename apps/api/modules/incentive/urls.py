from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    BondViewSet,
    ClaimViewSet,
    CustomerViewSet,
    ProjectViewSet,
    me_view,
    overview_view,
)

router = DefaultRouter()
router.register(r"incentive/customers", CustomerViewSet, basename="incentive-customer")
router.register(r"incentive/projects", ProjectViewSet, basename="incentive-project")
router.register(r"incentive/claims", ClaimViewSet, basename="incentive-claim")
router.register(r"incentive/bonds", BondViewSet, basename="incentive-bond")

urlpatterns = [
    path("incentive/overview/", overview_view, name="incentive-overview"),
    path("incentive/me/", me_view, name="incentive-me"),
    *router.urls,
]
