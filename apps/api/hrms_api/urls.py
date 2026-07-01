"""Root URL config. Module URLs mounted under /api/v1/."""

from django.conf import settings
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

api_v1_patterns = [
    path("", include("modules.identity.urls")),
    path("", include("modules.organization.urls")),
    path("", include("modules.employee.urls")),
    path("", include("modules.leave.urls")),
    path("", include("modules.schedule.urls")),
    path("", include("modules.attendance.urls")),
    path("", include("modules.claims.urls")),
    path("", include("modules.payslip.urls")),
    path("", include("modules.kpi.urls")),
    path("", include("modules.certification.urls")),
    path("", include("modules.notification.urls")),
    path("", include("modules.dashboard.urls")),
    path("", include("modules.announcements.urls")),
    path("", include("modules.onboarding.urls")),
    path("", include("modules.assignments.urls")),
    path("", include("modules.incentive.urls")),
    path("", include("common.audit.urls")),
    path("", include("common.reporting.urls")),
    path("org/", include("common.feature_flags.urls")),
]

# The OpenAPI schema + Swagger UI map the entire API surface — expose them only in
# DEBUG so prod never serves them publicly. (Contract generation uses the
# `spectacular` management command, not these routes, so `make contracts` is unaffected.)
if settings.DEBUG:
    api_v1_patterns = [
        path("schema/", SpectacularAPIView.as_view(), name="schema"),
        path("docs/", SpectacularSwaggerView.as_view(url_name="v1:schema"), name="swagger-ui"),
        *api_v1_patterns,
    ]


urlpatterns = [
    path("api/v1/", include((api_v1_patterns, "v1"))),
    path("", include("modules.health.urls")),
    # /metrics for Prometheus (scraped internally; not proxied by nginx).
    path("", include("django_prometheus.urls")),
]
