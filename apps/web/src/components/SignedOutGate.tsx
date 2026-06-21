import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/lib/auth";

export function SignedOutGate({ children }: { children: ReactNode }) {
	const { user, loading, mustChangePassword } = useAuth();
	const location = useLocation();
	if (loading) return null;
	if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
	// Temp-password accounts must set a new password before reaching any app
	// route. The /force-password-change route lives outside AppShell, so it is
	// never wrapped by this gate — no redirect loop.
	if (mustChangePassword && location.pathname !== "/force-password-change") {
		return <Navigate to="/force-password-change" replace />;
	}
	// New hires mid-onboarding resume the wizard (it lives outside AppShell, so
	// no loop). The key is only set once activation begins — existing users
	// have no `onboarding` key and are unaffected.
	const onboarding = user.preferences?.onboarding as { completed?: boolean } | undefined;
	if (onboarding && !onboarding.completed && location.pathname !== "/onboarding") {
		return <Navigate to="/onboarding" replace />;
	}
	return <>{children}</>;
}
