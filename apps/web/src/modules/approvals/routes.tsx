import { lazy } from "react";
import { Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";

const ApprovalsShell = lazy(() => import("./ApprovalsShell"));
const AllApprovalsPage = lazy(() => import("./pages/AllApprovalsPage"));
const ClaimsApprovalsPage = lazy(() => import("./pages/ClaimsApprovalsPage"));
const LeaveApprovalsPage = lazy(() => import("./pages/LeaveApprovalsPage"));
const KpiApprovalsPage = lazy(() => import("./pages/KpiApprovalsPage"));

export const approvalsRoutes: RouteObject[] = [
	{
		path: "approvals",
		element: <ApprovalsShell />,
		children: [
			{ index: true, element: <AllApprovalsPage /> },
			{ path: "claims", element: <ClaimsApprovalsPage /> },
			{ path: "leave", element: <LeaveApprovalsPage /> },
			{ path: "kpi", element: <KpiApprovalsPage /> },
		],
	},
	// Old routes redirect into the Approval Center shell.
	{ path: "leave/approvals", element: <Navigate to="/approvals/leave" replace /> },
	{ path: "claims/finance", element: <Navigate to="/approvals" replace /> },
];
