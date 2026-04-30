from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.feature_flags.exceptions import CriticalModuleError, UnknownModuleKeyError
from common.feature_flags.serializers import (
    FeatureFlagInputSerializer,
    FeatureFlagSerializer,
)
from common.feature_flags.services import list_for_org, set_enabled
from modules.identity.services.permissions import get_user_perms


def _has_perm(user, code: str) -> bool:
    return code in get_user_perms(user)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def feature_flags_list_view(request):
    """GET /api/v1/org/feature-flags/ — list all 15 entries with state."""
    if not _has_perm(request.user, "org:feature_flag:read"):
        return Response({"detail": "Permission denied"}, status=403)
    entries = list_for_org(request.user.org_id)
    return Response(FeatureFlagSerializer(entries, many=True).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def feature_flag_patch_view(request, key: str):
    """PATCH /api/v1/org/feature-flags/{key}/ — toggle enabled."""
    if not _has_perm(request.user, "org:feature_flag:write"):
        return Response({"detail": "Permission denied"}, status=403)

    serializer = FeatureFlagInputSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    enabled = serializer.validated_data["enabled"]

    try:
        set_enabled(request.user.org_id, key, enabled, actor=request.user)
    except CriticalModuleError as exc:
        return Response({"detail": str(exc)}, status=400)
    except UnknownModuleKeyError as exc:
        return Response({"detail": str(exc)}, status=400)

    entries = list_for_org(request.user.org_id)
    return Response(FeatureFlagSerializer(entries, many=True).data)
