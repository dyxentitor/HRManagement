from django.urls import path

from .views import (
    login_mfa_view,
    login_view,
    logout_view,
    me_view,
    mfa_confirm_view,
    mfa_disable_view,
    mfa_enable_view,
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
    path("auth/mfa/enable", mfa_enable_view, name="mfa-enable"),
    path("auth/mfa/confirm", mfa_confirm_view, name="mfa-confirm"),
    path("auth/mfa", mfa_disable_view, name="mfa-disable"),
    path("auth/login/mfa", login_mfa_view, name="login-mfa"),
]
