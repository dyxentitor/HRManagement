import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const LeaveApplyPage = lazy(() => import("./pages/LeaveApplyPage"));
const MyLeavePage = lazy(() => import("./pages/MyLeavePage"));
const ApprovalsInboxPage = lazy(() => import("./pages/ApprovalsInboxPage"));

export const leaveRoutes: RouteObject[] = [
	{ path: "leave/apply", element: <LeaveApplyPage /> },
	{ path: "leave/me", element: <MyLeavePage /> },
	{ path: "leave/approvals", element: <ApprovalsInboxPage /> },
];
