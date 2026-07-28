from django.urls import path

from common.mail.views import (
    EmailConfigView,
    EmailTemplateDetailView,
    EmailTemplateListView,
    email_template_preview_view,
    send_test_email_view,
    test_connection_view,
)

urlpatterns = [
    path("email-config/", EmailConfigView.as_view(), name="email-config"),
    path("email-config/test-connection/", test_connection_view, name="email-config-test"),
    path("email-config/send-test-email/", send_test_email_view, name="email-config-send-test"),
    # Email-template overrides (preview before detail to avoid <str:key> shadowing)
    path("email-templates/", EmailTemplateListView.as_view(), name="email-template-list"),
    path(
        "email-templates/<str:key>/preview/",
        email_template_preview_view,
        name="email-template-preview",
    ),
    path(
        "email-templates/<str:key>/",
        EmailTemplateDetailView.as_view(),
        name="email-template-detail",
    ),
]
