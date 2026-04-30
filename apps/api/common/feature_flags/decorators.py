"""@requires_feature(key) class decorator for any DRF view class.

Wraps the dispatch() to short-circuit with 403 when the key
is disabled for the request user's org. Critical modules pass through
because is_enabled() short-circuits them to True.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response

from common.feature_flags.services import is_enabled


def requires_feature(key: str):
    def wrap(cls):
        original_dispatch = cls.dispatch

        def dispatch(self, request, *args, **kwargs):
            self.request = self.initialize_request(request, *args, **kwargs)
            self.headers = self.default_response_headers
            try:
                self.initial(self.request, *args, **kwargs)
            except Exception:
                return original_dispatch(self, request, *args, **kwargs)

            user = getattr(self.request, "user", None)
            org_id = getattr(user, "org_id", None) if user else None

            if org_id and not is_enabled(org_id, key):
                response = Response(
                    {"detail": f"Module '{key}' is disabled for this organisation"},
                    status=status.HTTP_403_FORBIDDEN,
                )
                response.accepted_renderer = self.request.accepted_renderer
                response.accepted_media_type = self.request.accepted_media_type
                response.renderer_context = self.get_renderer_context()
                return response

            return original_dispatch(self, request, *args, **kwargs)

        cls.dispatch = dispatch
        return cls

    return wrap
