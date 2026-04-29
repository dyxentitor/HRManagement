from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    RoleViewSet,
    assign_user_roles_view,
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
    revoke_all_sessions_view,
    role_permissions_view,
    role_reset_view,
)

router = DefaultRouter()
router.register(r"roles", RoleViewSet, basename="role")

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
    path("auth/sessions/revoke-all", revoke_all_sessions_view, name="auth-sessions-revoke-all"),
    path("roles/<str:code>/permissions/", role_permissions_view, name="role-permissions"),
    path("roles/<str:code>/reset-to-defaults/", role_reset_view, name="role-reset"),
    path("users/<uuid:user_id>/roles/", assign_user_roles_view, name="user-roles-assign"),
    *router.urls,
]
