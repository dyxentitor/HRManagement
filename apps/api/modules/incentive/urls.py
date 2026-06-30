from rest_framework.routers import DefaultRouter

from .views import BondViewSet, ClaimViewSet, CustomerViewSet, ProjectViewSet

router = DefaultRouter()
router.register(r"incentive/customers", CustomerViewSet, basename="incentive-customer")
router.register(r"incentive/projects", ProjectViewSet, basename="incentive-project")
router.register(r"incentive/claims", ClaimViewSet, basename="incentive-claim")
router.register(r"incentive/bonds", BondViewSet, basename="incentive-bond")

urlpatterns = router.urls
