"""Reporting URL patterns."""

from django.urls import path

from .views import (
    ReportExportView,
    ReportJobDetailView,
    ReportListView,
    ReportRunView,
    ReportSchemaView,
    SavedViewDeleteView,
    SavedViewListCreateView,
)

urlpatterns = [
    path("reports", ReportListView.as_view(), name="report-list"),
    path("reports/<str:code>/schema", ReportSchemaView.as_view(), name="report-schema"),
    path("reports/<str:code>/run", ReportRunView.as_view(), name="report-run"),
    path("reports/<str:code>/export", ReportExportView.as_view(), name="report-export"),
    path("reports/jobs/<int:job_id>", ReportJobDetailView.as_view(), name="report-job-detail"),
    path("reports/saved-views", SavedViewListCreateView.as_view(), name="report-saved-view-list"),
    path(
        "reports/saved-views/<int:pk>",
        SavedViewDeleteView.as_view(),
        name="report-saved-view-delete",
    ),
]
