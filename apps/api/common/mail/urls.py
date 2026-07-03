from django.urls import path

from common.mail.views import EmailConfigView, send_test_email_view, test_connection_view

urlpatterns = [
    path("email-config/", EmailConfigView.as_view(), name="email-config"),
    path("email-config/test-connection/", test_connection_view, name="email-config-test"),
    path("email-config/send-test-email/", send_test_email_view, name="email-config-send-test"),
]
