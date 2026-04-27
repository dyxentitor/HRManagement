"""URL config for the claims module."""

from rest_framework.routers import DefaultRouter

from .views import ClaimCategoryViewSet, ClaimPolicyViewSet, ClaimRequestViewSet

router = DefaultRouter()
router.register(r"claims/categories", ClaimCategoryViewSet, basename="claim-category")
router.register(r"claims/policies", ClaimPolicyViewSet, basename="claim-policy")
router.register(r"claims", ClaimRequestViewSet, basename="claim")
urlpatterns = router.urls
