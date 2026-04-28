import { lazy } from "react";
import { Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";

const UnifiedInboxPage = lazy(() => import("./pages/UnifiedInboxPage"));

export const approvalsRoutes: RouteObject[] = [
	{ path: "approvals", element: <UnifiedInboxPage /> },
	// Old routes redirect to the unified inbox
	{ path: "leave/approvals", element: <Navigate to="/approvals" replace /> },
	{ path: "claims/finance", element: <Navigate to="/approvals" replace /> },
];
