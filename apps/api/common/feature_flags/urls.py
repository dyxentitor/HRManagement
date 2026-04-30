from django.urls import path

from common.feature_flags.views import (
    feature_flag_patch_view,
    feature_flags_list_view,
)

urlpatterns = [
    path("feature-flags/", feature_flags_list_view, name="feature-flag-list"),
    path("feature-flags/<str:key>/", feature_flag_patch_view, name="feature-flag-patch"),
]
