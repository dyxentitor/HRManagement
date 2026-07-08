import { lazy } from "react";
import { Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";

const ClaimSubmitPage = lazy(() => import("./pages/ClaimSubmitPage"));
const MyClaimsPage = lazy(() => import("./pages/MyClaimsPage"));
const FinanceQueuePage = lazy(() => import("./pages/FinanceQueuePage"));

export const claimsRoutes: RouteObject[] = [
	{ path: "claims/submit", element: <ClaimSubmitPage /> },
	{ path: "claims/me", element: <MyClaimsPage /> },
	// Claims approvals now live in the unified Approval Center.
	{ path: "claims/approvals", element: <Navigate to="/approvals?type=claim" replace /> },
	{ path: "claims/finance", element: <FinanceQueuePage /> },
];
