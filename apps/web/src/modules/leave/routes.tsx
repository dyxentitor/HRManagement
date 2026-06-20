import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const LeaveApplyPage = lazy(() => import("./pages/LeaveApplyPage"));
const MyLeavePage = lazy(() => import("./pages/MyLeavePage"));

export const leaveRoutes: RouteObject[] = [
	{ path: "leave/apply", element: <LeaveApplyPage /> },
	{ path: "leave/me", element: <MyLeavePage /> },
	// /leave/approvals is handled by modules/approvals (redirects to the unified
	// /approvals inbox) — leave no longer ships its own approvals page.
];
