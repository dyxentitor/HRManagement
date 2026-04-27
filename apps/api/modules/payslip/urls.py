"""URL config for the payslip + payroll module."""

from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import PayrollPeriodViewSet, PayrollRunViewSet, PayslipViewSet

router = DefaultRouter()
router.register(r"payslips", PayslipViewSet, basename="payslip")
router.register(r"payroll/periods", PayrollPeriodViewSet, basename="payroll-period")

# PayrollRunViewSet uses GenericViewSet; register list/create/retrieve + custom actions
run_list = PayrollRunViewSet.as_view({"get": "list", "post": "create"})
run_detail = PayrollRunViewSet.as_view({"get": "retrieve"})
run_preview = PayrollRunViewSet.as_view({"post": "preview"})
run_publish = PayrollRunViewSet.as_view({"post": "publish"})
run_errors = PayrollRunViewSet.as_view({"get": "errors"})

urlpatterns = [
    *router.urls,
    path("payroll/runs/", run_list, name="payroll-run-list"),
    path("payroll/runs/<pk>/", run_detail, name="payroll-run-detail"),
    path("payroll/runs/<pk>/preview/", run_preview, name="payroll-run-preview"),
    path("payroll/runs/<pk>/publish/", run_publish, name="payroll-run-publish"),
    path("payroll/runs/<pk>/errors/", run_errors, name="payroll-run-errors"),
]
