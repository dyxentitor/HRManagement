import { lazy } from "react";
import { Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";

const ApprovalCenterPage = lazy(() => import("./ApprovalCenterPage"));

export const approvalsRoutes: RouteObject[] = [
	{ path: "approvals", element: <ApprovalCenterPage /> },
	// Old routes redirect into the unified Approval Center
	{ path: "leave/approvals", element: <Navigate to="/approvals" replace /> },
	{ path: "claims/finance", element: <Navigate to="/approvals" replace /> },
];
