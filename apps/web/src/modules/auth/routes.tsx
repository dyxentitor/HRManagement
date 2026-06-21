import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const ForcePasswordChangePage = lazy(() => import("./pages/ForcePasswordChangePage"));
const OnboardingWizard = lazy(() =>
	import("@/modules/onboarding/OnboardingWizard").then((m) => ({
		default: m.OnboardingWizard,
	})),
);

export const authRoutes: RouteObject[] = [
	{ path: "/login", element: <LoginPage /> },
	{ path: "/forgot-password", element: <ForgotPasswordPage /> },
	{ path: "/reset-password", element: <ResetPasswordPage /> },
	{ path: "/force-password-change", element: <ForcePasswordChangePage /> },
	{ path: "/activate", element: <OnboardingWizard mode="activate" /> },
	{ path: "/onboarding", element: <OnboardingWizard mode="resume" /> },
];
