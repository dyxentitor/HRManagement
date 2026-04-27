from django.urls import path

from .views import (
    login_view,
    logout_view,
    me_view,
    password_forgot_view,
    password_reset_view,
    refresh_view,
)

urlpatterns = [
    path("auth/login", login_view, name="auth-login"),
    path("auth/refresh", refresh_view, name="auth-refresh"),
    path("auth/logout", logout_view, name="auth-logout"),
    path("auth/me", me_view, name="auth-me"),
    path("auth/password/forgot", password_forgot_view, name="auth-password-forgot"),
    path("auth/password/reset", password_reset_view, name="auth-password-reset"),
]
