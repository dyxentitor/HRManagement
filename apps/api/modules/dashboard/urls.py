"""Dashboard module URL config."""

from __future__ import annotations

from django.urls import path

from .views import ApprovalsInboxView, DashboardView

urlpatterns = [
    path("approvals/inbox", ApprovalsInboxView.as_view(), name="approvals-inbox"),
    path("dashboards/<str:variant>", DashboardView.as_view(), name="dashboard"),
]
