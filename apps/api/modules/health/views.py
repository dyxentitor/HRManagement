"""Health check views — used by liveness/readiness probes and uptime monitors."""
from django.db import connection
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health(_request: object) -> Response:
    """Liveness check — process is up."""
    return Response({"status": "ok"})


@api_view(["GET"])
@permission_classes([AllowAny])
def ready(_request: object) -> Response:
    """Readiness check — dependencies (DB) reachable."""
    checks: dict[str, str] = {}
    overall_ok = True
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks["database"] = "ok"
    except Exception as exc:  # pragma: no cover - exercised via integration
        checks["database"] = f"error: {exc}"
        overall_ok = False
    return Response(
        {"status": "ready" if overall_ok else "not_ready", "checks": checks},
        status=status.HTTP_200_OK if overall_ok else status.HTTP_503_SERVICE_UNAVAILABLE,
    )
