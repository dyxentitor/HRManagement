"""Root URL config. Module URLs mounted under /api/v1/."""

from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

api_v1_patterns = [
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "docs/",
        SpectacularSwaggerView.as_view(url_name="v1:schema"),
        name="swagger-ui",
    ),
    path("", include("modules.identity.urls")),
    path("", include("modules.organization.urls")),
    path("", include("modules.employee.urls")),
    path("", include("modules.leave.urls")),
    path("", include("modules.schedule.urls")),
    path("", include("modules.attendance.urls")),
]


urlpatterns = [
    path("api/v1/", include((api_v1_patterns, "v1"))),
    path("", include("modules.health.urls")),
]
