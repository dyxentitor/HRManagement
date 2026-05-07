"""Leave module URL routing."""

from rest_framework.routers import DefaultRouter

from .views import (
    AdminAccrualViewSet,
    EmployeeLeaveOverrideViewSet,
    LeaveBalanceViewSet,
    LeavePolicyViewSet,
    LeaveRequestViewSet,
    LeaveTypeViewSet,
)

router = DefaultRouter()
router.register(r"leave/types", LeaveTypeViewSet, basename="leave-type")
router.register(r"leave/policies", LeavePolicyViewSet, basename="leave-policy")
router.register(
    r"leave/employee-overrides",
    EmployeeLeaveOverrideViewSet,
    basename="employee-leave-override",
)
router.register(r"leave/balances", LeaveBalanceViewSet, basename="leave-balance")
router.register(r"leave/requests", LeaveRequestViewSet, basename="leave-request")
router.register(r"admin/leave", AdminAccrualViewSet, basename="admin-leave")
urlpatterns = router.urls
