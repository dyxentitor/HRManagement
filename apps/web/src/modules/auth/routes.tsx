import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const PreferencesPage = lazy(() => import("./pages/PreferencesPage"));

export const authRoutes: RouteObject[] = [
	{ path: "/login", element: <LoginPage /> },
	{ path: "/forgot-password", element: <ForgotPasswordPage /> },
	{ path: "/reset-password", element: <ResetPasswordPage /> },
	{ path: "/me/preferences", element: <PreferencesPage /> },
];
